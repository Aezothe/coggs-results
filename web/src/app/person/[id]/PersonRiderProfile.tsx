import { getServiceClient } from "@/lib/supabase/server";

const MIN_RIDES_FOR_BAR = 3;
const MIN_RIDES_FOR_SLIDER = 6;
const MIN_STAGE_FINISHERS = 3;

// Unified threshold: below this, the rider is in "new rider" mode.
// New rider mode shows the welcome banner, uses hybrid splits-prefer math,
// and hides the slider.
const NEW_RIDER_DATA_THRESHOLD = 6;

const FIELD_WEIGHT = 0.6;
const PERSONAL_WEIGHT = 0.4;

type StageRide = {
  person_id: string;
  stage_id: string;
  stage_position_class: number | null;
  finishers_class: number | null;
  time_ms: number | null;
};

type SplitRide = {
  person_id: string;
  split_segment_id: string;
  parent_stage_id: string;
  split_position_class: number | null;
  split_finishers_class: number | null;
  time_ms: number | null;
};

type StageTagRow = {
  stage_id: string;
  tag_id: string;
};

type SegmentTagRow = {
  segment_id: string;
  tag_id: string;
};

type TagCategoryRow = {
  tag_id: string;
  category_id: string;
};

type CategoryRow = {
  id: string;
  name: string;
  display_order: number | null;
  rendering: "bar" | "slider";
  slider_low_label: string | null;
  slider_high_label: string | null;
};

type RiderBarValue = {
  kind: "bar";
  category_id: string;
  category_name: string;
  display_order: number;
  value: number;
};

type RiderSliderValue = {
  kind: "slider";
  category_id: string;
  category_name: string;
  display_order: number;
  low_label: string;
  high_label: string;
  position: number;
};

// Internal per-category source breakdown so new-rider mode can prefer splits.
// Stage and split percentiles are stored separately, then combined at display time.
type BarAggregation = {
  person_id: string;
  category_id: string;
  category_name: string;
  display_order: number;
  stage_pcts: number[];
  split_pcts: number[];
};

type SliderAggregation = {
  person_id: string;
  category_id: string;
  category_name: string;
  display_order: number;
  low_label: string;
  high_label: string;
  low_score: number;
  high_score: number;
  rides: number;
};

function percentile(position: number, finishers: number): number {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

async function fetchAllData(): Promise<{
  stageRides: StageRide[];
  splitRides: SplitRide[];
  categoriesByStage: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >;
  categoriesBySplitSegment: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >;
  categories: CategoryRow[];
  stageLengthRank: Map<string, number>;
}> {
  const supabase = getServiceClient();

  const pageSize = 1000;
  const stageRides: StageRide[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("event_stage_times")
      .select(
        "person_id, stage_id, stage_position_class, finishers_class, time_ms",
      )
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) {
      stageRides.push({
        person_id: r.person_id as string,
        stage_id: r.stage_id as string,
        stage_position_class: r.stage_position_class as number | null,
        finishers_class: r.finishers_class as number | null,
        time_ms: r.time_ms as number | null,
      });
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const splitRides: SplitRide[] = [];
  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("event_split_times")
      .select(
        "person_id, split_segment_id, parent_stage_id, split_position_class, split_finishers_class, time_ms",
      )
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) {
      splitRides.push({
        person_id: r.person_id as string,
        split_segment_id: r.split_segment_id as string,
        parent_stage_id: r.parent_stage_id as string,
        split_position_class: r.split_position_class as number | null,
        split_finishers_class: r.split_finishers_class as number | null,
        time_ms: r.time_ms as number | null,
      });
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const { data: catData, error: catErr } = await supabase
    .from("category")
    .select(
      "id, name, display_order, rendering, slider_low_label, slider_high_label",
    )
    .eq("category_type", "terrain")
    .order("display_order", { ascending: true });
  if (catErr) throw new Error(catErr.message);
  const categories = (catData ?? []) as CategoryRow[];

  const { data: tcData, error: tcErr } = await supabase
    .from("tag_category")
    .select("tag_id, category_id");
  if (tcErr) throw new Error(tcErr.message);
  const tagToCategories = new Map<string, string[]>();
  for (const row of (tcData ?? []) as TagCategoryRow[]) {
    if (!tagToCategories.has(row.tag_id)) tagToCategories.set(row.tag_id, []);
    tagToCategories.get(row.tag_id)!.push(row.category_id);
  }

  const { data: stData, error: stErr } = await supabase
    .from("stage_tag")
    .select("stage_id, tag_id");
  if (stErr) throw new Error(stErr.message);

  const { data: segData, error: segErr } = await supabase
    .from("segment_tag")
    .select("segment_id, tag_id");
  if (segErr) throw new Error(segErr.message);

  const categoryById = new Map<
    string,
    { id: string; name: string; display_order: number }
  >();
  for (const c of categories) {
    if (c.rendering !== "bar") continue;
    categoryById.set(c.id, {
      id: c.id,
      name: c.name,
      display_order: c.display_order ?? 0,
    });
  }

  const categoriesByStage = new Map<
    string,
    { id: string; name: string; display_order: number }[]
  >();
  for (const row of (stData ?? []) as StageTagRow[]) {
    const cats = tagToCategories.get(row.tag_id);
    if (!cats) continue;
    if (!categoriesByStage.has(row.stage_id))
      categoriesByStage.set(row.stage_id, []);
    const existing = categoriesByStage.get(row.stage_id)!;
    for (const catId of cats) {
      const cat = categoryById.get(catId);
      if (!cat) continue;
      if (!existing.some((e) => e.id === cat.id)) existing.push(cat);
    }
  }

  const categoriesBySplitSegment = new Map<
    string,
    { id: string; name: string; display_order: number }[]
  >();
  for (const row of (segData ?? []) as SegmentTagRow[]) {
    const cats = tagToCategories.get(row.tag_id);
    if (!cats) continue;
    if (!categoriesBySplitSegment.has(row.segment_id))
      categoriesBySplitSegment.set(row.segment_id, []);
    const existing = categoriesBySplitSegment.get(row.segment_id)!;
    for (const catId of cats) {
      const cat = categoryById.get(catId);
      if (!cat) continue;
      if (!existing.some((e) => e.id === cat.id)) existing.push(cat);
    }
  }

  const stageWinningTime = new Map<string, number>();
  const stageFinisherCount = new Map<string, number>();
  for (const r of stageRides) {
    if (r.time_ms == null) continue;
    stageFinisherCount.set(
      r.stage_id,
      (stageFinisherCount.get(r.stage_id) ?? 0) + 1,
    );
    const current = stageWinningTime.get(r.stage_id);
    if (current === undefined || r.time_ms < current) {
      stageWinningTime.set(r.stage_id, r.time_ms);
    }
  }

  const usableStageLengths: { stage_id: string; winning_time: number }[] = [];
  for (const [stage_id, winning_time] of stageWinningTime.entries()) {
    if ((stageFinisherCount.get(stage_id) ?? 0) >= MIN_STAGE_FINISHERS) {
      usableStageLengths.push({ stage_id, winning_time });
    }
  }

  usableStageLengths.sort((a, b) => a.winning_time - b.winning_time);
  const stageLengthRank = new Map<string, number>();
  const n = usableStageLengths.length;
  if (n === 1) {
    stageLengthRank.set(usableStageLengths[0].stage_id, 0.5);
  } else if (n > 1) {
    usableStageLengths.forEach((s, i) => {
      stageLengthRank.set(s.stage_id, i / (n - 1));
    });
  }

  return {
    stageRides,
    splitRides,
    categoriesByStage,
    categoriesBySplitSegment,
    categories,
    stageLengthRank,
  };
}

function buildAggregations(
  stageRides: StageRide[],
  splitRides: SplitRide[],
  categoriesByStage: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >,
  categoriesBySplitSegment: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >,
  categories: CategoryRow[],
  stageLengthRank: Map<string, number>,
): { bars: BarAggregation[]; sliders: SliderAggregation[] } {
  const sliderCats = categories.filter((c) => c.rendering === "slider");

  // person_id -> category_id -> { name, display_order, stage_pcts, split_pcts }
  const barAcc = new Map<
    string,
    Map<
      string,
      {
        name: string;
        display_order: number;
        stage_pcts: number[];
        split_pcts: number[];
      }
    >
  >();

  const sliderAcc = new Map<
    string,
    Map<
      string,
      {
        name: string;
        display_order: number;
        low_label: string;
        high_label: string;
        weighted_sum_low: number;
        weight_sum_low: number;
        weighted_sum_high: number;
        weight_sum_high: number;
        rides: number;
      }
    >
  >();

  function getOrCreateBarSlot(
    person_id: string,
    cat: { id: string; name: string; display_order: number },
  ) {
    if (!barAcc.has(person_id)) barAcc.set(person_id, new Map());
    const inner = barAcc.get(person_id)!;
    if (!inner.has(cat.id)) {
      inner.set(cat.id, {
        name: cat.name,
        display_order: cat.display_order,
        stage_pcts: [],
        split_pcts: [],
      });
    }
    return inner.get(cat.id)!;
  }

  // STAGES: contribute to stage bars + sliders (length math)
  for (const r of stageRides) {
    if (!r.person_id) continue;
    if (r.time_ms == null) continue;
    if (r.stage_position_class == null || r.finishers_class == null) continue;

    const pct = percentile(r.stage_position_class, r.finishers_class);

    const cats = categoriesByStage.get(r.stage_id) ?? [];
    for (const c of cats) {
      const slot = getOrCreateBarSlot(r.person_id, c);
      slot.stage_pcts.push(pct);
    }

    const lengthRank = stageLengthRank.get(r.stage_id);
    if (lengthRank !== undefined) {
      if (!sliderAcc.has(r.person_id)) sliderAcc.set(r.person_id, new Map());
      const inner = sliderAcc.get(r.person_id)!;
      for (const sc of sliderCats) {
        if (!inner.has(sc.id)) {
          inner.set(sc.id, {
            name: sc.name,
            display_order: sc.display_order ?? 0,
            low_label: sc.slider_low_label ?? "Low",
            high_label: sc.slider_high_label ?? "High",
            weighted_sum_low: 0,
            weight_sum_low: 0,
            weighted_sum_high: 0,
            weight_sum_high: 0,
            rides: 0,
          });
        }
        const slot = inner.get(sc.id)!;
        slot.weighted_sum_high += pct * lengthRank;
        slot.weight_sum_high += lengthRank;
        slot.weighted_sum_low += pct * (1 - lengthRank);
        slot.weight_sum_low += 1 - lengthRank;
        slot.rides += 1;
      }
    }
  }

  // SPLITS: contribute to split bars only if they're tagged.
  // No parent stage tag inheritance, no slider contribution.
  for (const r of splitRides) {
    if (!r.person_id) continue;
    if (r.time_ms == null) continue;
    if (r.split_position_class == null || r.split_finishers_class == null)
      continue;

    const cats = categoriesBySplitSegment.get(r.split_segment_id);
    if (!cats || cats.length === 0) continue;

    const pct = percentile(r.split_position_class, r.split_finishers_class);

    for (const c of cats) {
      const slot = getOrCreateBarSlot(r.person_id, c);
      slot.split_pcts.push(pct);
    }
  }

  const bars: BarAggregation[] = [];
  for (const [person_id, catMap] of barAcc.entries()) {
    for (const [category_id, slot] of catMap.entries()) {
      if (slot.stage_pcts.length === 0 && slot.split_pcts.length === 0)
        continue;
      bars.push({
        person_id,
        category_id,
        category_name: slot.name,
        display_order: slot.display_order,
        stage_pcts: slot.stage_pcts,
        split_pcts: slot.split_pcts,
      });
    }
  }

  const sliders: SliderAggregation[] = [];
  for (const [person_id, catMap] of sliderAcc.entries()) {
    for (const [category_id, slot] of catMap.entries()) {
      if (slot.weight_sum_low === 0 || slot.weight_sum_high === 0) continue;
      sliders.push({
        person_id,
        category_id,
        category_name: slot.name,
        display_order: slot.display_order,
        low_label: slot.low_label,
        high_label: slot.high_label,
        low_score: slot.weighted_sum_low / slot.weight_sum_low,
        high_score: slot.weighted_sum_high / slot.weight_sum_high,
        rides: slot.rides,
      });
    }
  }

  return { bars, sliders };
}

// Compute average percentile + ride count for a category given the rider's data.
// New riders prefer splits per category; non-new riders combine stage + splits.
function categoryAvgAndRides(
  agg: BarAggregation,
  newRiderMode: boolean,
): { avg_percentile: number; rides: number } {
  let pcts: number[];
  if (newRiderMode && agg.split_pcts.length > 0) {
    // Splits take priority for new riders when this category has split data
    pcts = agg.split_pcts;
  } else {
    pcts = [...agg.stage_pcts, ...agg.split_pcts];
  }
  const rides = pcts.length;
  const avg_percentile =
    rides === 0 ? 0 : pcts.reduce((a, b) => a + b, 0) / rides;
  return { avg_percentile, rides };
}

function buildBarValues(
  allBars: BarAggregation[],
  personId: string,
  newRiderMode: boolean,
): RiderBarValue[] {
  // Field rank distribution always uses combined data above the bar threshold.
  // This anchors the comparison to "where the rider sits among everyone."
  const fieldByCat = new Map<string, number[]>();
  for (const a of allBars) {
    const { avg_percentile, rides } = categoryAvgAndRides(a, false);
    if (rides < MIN_RIDES_FOR_BAR) continue;
    if (!fieldByCat.has(a.category_id)) fieldByCat.set(a.category_id, []);
    fieldByCat.get(a.category_id)!.push(avg_percentile);
  }
  for (const arr of fieldByCat.values()) arr.sort((a, b) => a - b);

  function fieldRank(category_id: string, value: number): number {
    const arr = fieldByCat.get(category_id);
    if (!arr || arr.length < 2) return 0.5;
    let below = 0;
    for (const v of arr) {
      if (v < value) below++;
      else break;
    }
    return below / (arr.length - 1);
  }

  // Resolve this rider's categories with appropriate source preference
  const riderResolved = allBars
    .filter((a) => a.person_id === personId)
    .map((a) => {
      const { avg_percentile, rides } = categoryAvgAndRides(a, newRiderMode);
      return { agg: a, avg_percentile, rides };
    });

  // Filter by threshold:
  // - New rider mode: include every category the rider has any data for
  // - Normal mode: only categories meeting MIN_RIDES_FOR_BAR
  const filtered = riderResolved.filter((r) => {
    if (r.rides === 0) return false;
    if (!newRiderMode && r.rides < MIN_RIDES_FOR_BAR) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  // Personal range only meaningful with enough categories AND in normal mode
  const riderVals = filtered.map((r) => r.avg_percentile);
  const riderMin = Math.min(...riderVals);
  const riderMax = Math.max(...riderVals);
  const riderSpread = riderMax - riderMin;

  function personalRank(value: number): number {
    if (riderSpread < 0.01) return 0.5;
    return (value - riderMin) / riderSpread;
  }

  return filtered.map((r) => {
    const field = fieldRank(r.agg.category_id, r.avg_percentile);
    let value: number;
    if (newRiderMode) {
      value = field;
    } else {
      const personal = personalRank(r.avg_percentile);
      value = FIELD_WEIGHT * field + PERSONAL_WEIGHT * personal;
    }
    return {
      kind: "bar" as const,
      category_id: r.agg.category_id,
      category_name: r.agg.category_name,
      display_order: r.agg.display_order,
      value,
    };
  });
}

function buildSliderValues(
  allSliders: SliderAggregation[],
  personId: string,
): RiderSliderValue[] {
  const riderSliders = allSliders.filter(
    (a) => a.person_id === personId && a.rides >= MIN_RIDES_FOR_SLIDER,
  );
  if (riderSliders.length === 0) return [];

  const fieldDiffsByCat = new Map<string, number[]>();
  for (const a of allSliders) {
    if (a.rides < MIN_RIDES_FOR_SLIDER) continue;
    if (!fieldDiffsByCat.has(a.category_id))
      fieldDiffsByCat.set(a.category_id, []);
    fieldDiffsByCat.get(a.category_id)!.push(a.high_score - a.low_score);
  }

  const PEG_STDDEVS = 2;

  return riderSliders.map((t) => {
    const myDiff = t.high_score - t.low_score;
    const fieldDiffs = fieldDiffsByCat.get(t.category_id) ?? [];
    let stddev = 0.05;
    if (fieldDiffs.length >= 2) {
      const mean = fieldDiffs.reduce((a, b) => a + b, 0) / fieldDiffs.length;
      const variance =
        fieldDiffs.reduce((s, d) => s + (d - mean) ** 2, 0) /
        fieldDiffs.length;
      stddev = Math.sqrt(variance);
      if (stddev < 0.01) stddev = 0.01;
    }
    const range = PEG_STDDEVS * stddev;
    const normalized = (myDiff + range) / (2 * range);
    return {
      kind: "slider" as const,
      category_id: t.category_id,
      category_name: t.category_name,
      display_order: t.display_order,
      low_label: t.low_label,
      high_label: t.high_label,
      position: Math.max(0, Math.min(1, normalized)),
    };
  });
}

// Counts a rider's total data points across all categories (stage + split).
// This is what triggers new-rider mode.
function totalDataPointsFor(
  allBars: BarAggregation[],
  personId: string,
): number {
  let total = 0;
  for (const a of allBars) {
    if (a.person_id !== personId) continue;
    total += a.stage_pcts.length + a.split_pcts.length;
  }
  return total;
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-3 w-full rounded overflow-hidden bg-surface-border-strong">
      <div
        className="h-full transition-all"
        style={{
          width: `${pct}%`,
          backgroundColor: "var(--color-accent-1)",
        }}
      />
    </div>
  );
}

function PreferenceSlider({
  position,
  lowLabel,
  highLabel,
}: {
  position: number;
  lowLabel: string;
  highLabel: string;
}) {
  const clampedPos = Math.max(0, Math.min(1, position));
  const width = 200;
  const height = 110;
  const cx = width / 2;
  const cy = height - 10;
  const r = 80;
  const stroke = 16;
  const arcPath = `
    M ${cx - r} ${cy}
    A ${r} ${r} 0 0 1 ${cx + r} ${cy}
  `;
  const angleDeg = 180 - clampedPos * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const markerX = cx + r * Math.cos(angleRad);
  const markerY = cy - r * Math.sin(angleRad);

  return (
    <div className="flex flex-col items-center w-[200px]">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient
            id="preferenceGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="var(--color-accent-1)" />
            <stop offset="100%" stopColor="var(--color-accent-2)" />
          </linearGradient>
        </defs>
        <path
          d={arcPath}
          stroke="url(#preferenceGradient)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
        <circle
          cx={markerX}
          cy={markerY}
          r={11}
          fill="var(--color-marker-fill)"
          stroke="var(--color-marker-stroke)"
          strokeWidth={2.5}
        />
        <circle
          cx={markerX}
          cy={markerY}
          r={5}
          fill="var(--color-marker-stroke)"
        />
      </svg>
      <div className="flex justify-between w-full text-xs -mt-1 text-surface-foreground">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function BarRow({ entry }: { entry: RiderBarValue }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3 mb-2">
      <div className="text-sm truncate text-surface-foreground">
        {entry.category_name}
      </div>
      <ProgressBar value={entry.value} />
    </div>
  );
}

function SliderRow({ entry }: { entry: RiderSliderValue }) {
  return (
    <div className="flex justify-center my-2">
      <PreferenceSlider
        position={entry.position}
        lowLabel={entry.low_label}
        highLabel={entry.high_label}
      />
    </div>
  );
}

function ProfileCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-dark rounded-lg p-4 mb-8 border bg-surface border-surface-border max-w-md mx-auto">
      <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-surface-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NewRiderBanner({ dataPoints }: { dataPoints: number }) {
  const message =
    dataPoints === 0
      ? "Race events to see your terrain affinity."
      : `Showing a preliminary profile based on ${dataPoints} data point${dataPoints === 1 ? "" : "s"}. Race more events for accurate stats.`;

  return (
    <div
      className="rounded-lg p-3 mb-8 max-w-md mx-auto text-center text-sm border"
      style={{
        backgroundColor: "var(--color-accent-1)",
        color: "white",
        borderColor: "var(--color-accent-1-hover)",
      }}
    >
      <span className="font-semibold">Welcome!</span> {message}
    </div>
  );
}

export async function PersonRiderProfile({
  personId,
}: {
  personId: string;
}) {
  let allBars: BarAggregation[] = [];
  let allSliders: SliderAggregation[] = [];
  let errorMsg: string | null = null;
  let dataPoints = 0;

  try {
    const {
      stageRides,
      splitRides,
      categoriesByStage,
      categoriesBySplitSegment,
      categories,
      stageLengthRank,
    } = await fetchAllData();
    const result = buildAggregations(
      stageRides,
      splitRides,
      categoriesByStage,
      categoriesBySplitSegment,
      categories,
      stageLengthRank,
    );
    allBars = result.bars;
    allSliders = result.sliders;
    dataPoints = totalDataPointsFor(allBars, personId);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3 text-page-foreground">
          Rider profile
        </h2>
        <p className="text-sm text-danger">Error: {errorMsg}</p>
      </section>
    );
  }

  // Unified threshold: anything below = new rider mode
  const newRiderMode = dataPoints < NEW_RIDER_DATA_THRESHOLD;

  const bars = buildBarValues(allBars, personId, newRiderMode);
  const sliders = newRiderMode ? [] : buildSliderValues(allSliders, personId);

  // If they're a new rider, always show the banner — even with no bars
  if (!newRiderMode && bars.length === 0 && sliders.length === 0) return null;

  return (
    <section>
      {newRiderMode && <NewRiderBanner dataPoints={dataPoints} />}

      {bars.length > 0 && (
        <ProfileCard title="Terrain Affinity">
          {bars.map((entry) => (
            <BarRow key={entry.category_id} entry={entry} />
          ))}
        </ProfileCard>
      )}

      {sliders.length > 0 && (
        <ProfileCard title="Rider Type">
          {sliders.map((entry) => (
            <SliderRow key={entry.category_id} entry={entry} />
          ))}
        </ProfileCard>
      )}
    </section>
  );
}