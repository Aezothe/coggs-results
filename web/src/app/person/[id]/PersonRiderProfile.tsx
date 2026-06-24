import { getServiceClient } from "@/lib/supabase/server";

const MIN_RIDES_FOR_BAR = 3;
const MIN_RIDES_FOR_SLIDER = 6;
const MIN_STAGE_FINISHERS = 3;

const FIELD_WEIGHT = 0.6;
const PERSONAL_WEIGHT = 0.4;

type StageRide = {
  person_id: string;
  stage_id: string;
  stage_position_class: number | null;
  finishers_class: number | null;
  time_ms: number | null;
};

type StageTagRow = {
  stage_id: string;
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
  position: number; // 0..1, 0=fully low, 0.5=center, 1=fully high
};

type RiderProfileEntry = RiderBarValue | RiderSliderValue;

type BarAggregation = {
  person_id: string;
  category_id: string;
  category_name: string;
  display_order: number;
  avg_percentile: number;
  rides: number;
};

type SliderAggregation = {
  person_id: string;
  category_id: string;
  category_name: string;
  display_order: number;
  low_label: string;
  high_label: string;
  // Internal scores used to derive position
  low_score: number; // weighted avg favoring short stages
  high_score: number; // weighted avg favoring long stages
  rides: number;
};

function percentile(position: number, finishers: number): number {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

async function fetchAllData(): Promise<{
  rides: StageRide[];
  categoriesByStage: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >;
  categories: CategoryRow[];
  stageLengthRank: Map<string, number>;
}> {
  const supabase = getServiceClient();

  const pageSize = 1000;
  const rides: StageRide[] = [];
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
    rides.push(...(data as StageRide[]));
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

  const categoryById = new Map<
    string,
    { id: string; name: string; display_order: number }
  >();
  for (const c of categories) {
    if (c.rendering !== "bar") continue; // only tag-driven categories
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
    if (!categoriesByStage.has(row.stage_id)) {
      categoriesByStage.set(row.stage_id, []);
    }
    const existing = categoriesByStage.get(row.stage_id)!;
    for (const catId of cats) {
      const cat = categoryById.get(catId);
      if (!cat) continue;
      if (!existing.some((e) => e.id === cat.id)) {
        existing.push(cat);
      }
    }
  }

  // Stage length: winning time per stage with enough finishers
  const stageWinningTime = new Map<string, number>();
  const stageFinisherCount = new Map<string, number>();
  for (const r of rides) {
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

  return { rides, categoriesByStage, categories, stageLengthRank };
}

function buildAggregations(
  rides: StageRide[],
  categoriesByStage: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >,
  categories: CategoryRow[],
  stageLengthRank: Map<string, number>,
): { bars: BarAggregation[]; sliders: SliderAggregation[] } {
  const sliderCats = categories.filter((c) => c.rendering === "slider");

  // Tag-driven bar accumulator
  const barAcc = new Map<
    string,
    Map<string, { name: string; display_order: number; pcts: number[] }>
  >();

  // Slider accumulator (per rider, per slider category)
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

  for (const r of rides) {
    if (!r.person_id) continue;
    if (r.time_ms == null) continue;
    if (r.stage_position_class == null || r.finishers_class == null) continue;

    const pct = percentile(r.stage_position_class, r.finishers_class);

    // Tag-driven contribution
    const cats = categoriesByStage.get(r.stage_id) ?? [];
    if (cats.length > 0) {
      if (!barAcc.has(r.person_id)) barAcc.set(r.person_id, new Map());
      const inner = barAcc.get(r.person_id)!;
      for (const c of cats) {
        if (!inner.has(c.id)) {
          inner.set(c.id, {
            name: c.name,
            display_order: c.display_order,
            pcts: [],
          });
        }
        inner.get(c.id)!.pcts.push(pct);
      }
    }

    // Slider contribution (based on stage length)
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
        // High = endurance = longer stages weigh more
        slot.weighted_sum_high += pct * lengthRank;
        slot.weight_sum_high += lengthRank;
        // Low = power = shorter stages weigh more
        slot.weighted_sum_low += pct * (1 - lengthRank);
        slot.weight_sum_low += 1 - lengthRank;
        slot.rides += 1;
      }
    }
  }

  const bars: BarAggregation[] = [];
  for (const [person_id, catMap] of barAcc.entries()) {
    for (const [category_id, slot] of catMap.entries()) {
      if (slot.pcts.length === 0) continue;
      bars.push({
        person_id,
        category_id,
        category_name: slot.name,
        display_order: slot.display_order,
        avg_percentile:
          slot.pcts.reduce((a, b) => a + b, 0) / slot.pcts.length,
        rides: slot.pcts.length,
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

function buildBarValues(
  allBars: BarAggregation[],
  personId: string,
): RiderBarValue[] {
  const riderBars = allBars.filter(
    (a) => a.person_id === personId && a.rides >= MIN_RIDES_FOR_BAR,
  );
  if (riderBars.length === 0) return [];

  const fieldByCat = new Map<string, number[]>();
  for (const a of allBars) {
    if (a.rides < MIN_RIDES_FOR_BAR) continue;
    if (!fieldByCat.has(a.category_id)) fieldByCat.set(a.category_id, []);
    fieldByCat.get(a.category_id)!.push(a.avg_percentile);
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

  const riderVals = riderBars.map((t) => t.avg_percentile);
  const riderMin = Math.min(...riderVals);
  const riderMax = Math.max(...riderVals);
  const riderSpread = riderMax - riderMin;

  function personalRank(value: number): number {
    if (riderSpread < 0.01) return 0.5;
    return (value - riderMin) / riderSpread;
  }

  return riderBars.map((t) => ({
    kind: "bar" as const,
    category_id: t.category_id,
    category_name: t.category_name,
    display_order: t.display_order,
    value:
      FIELD_WEIGHT * fieldRank(t.category_id, t.avg_percentile) +
      PERSONAL_WEIGHT * personalRank(t.avg_percentile),
  }));
}

function buildSliderValues(
  allSliders: SliderAggregation[],
  personId: string,
): RiderSliderValue[] {
  const riderSliders = allSliders.filter(
    (a) => a.person_id === personId && a.rides >= MIN_RIDES_FOR_SLIDER,
  );
  if (riderSliders.length === 0) return [];

  // For each slider category, find the field range of (high - low)
  const fieldDiffs = new Map<string, number[]>();
  for (const a of allSliders) {
    if (a.rides < MIN_RIDES_FOR_SLIDER) continue;
    if (!fieldDiffs.has(a.category_id)) fieldDiffs.set(a.category_id, []);
    fieldDiffs.get(a.category_id)!.push(a.high_score - a.low_score);
  }

  return riderSliders.map((t) => {
    const myDiff = t.high_score - t.low_score;
    const fieldRange = fieldDiffs.get(t.category_id) ?? [];
    const maxAbs = Math.max(
      0.01,
      ...fieldRange.map((d) => Math.abs(d)),
    );
    // Normalize: -maxAbs maps to 0, +maxAbs maps to 1, 0 maps to 0.5
    const normalized = (myDiff + maxAbs) / (2 * maxAbs);
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

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-3 w-full rounded bg-gray-200 overflow-hidden">
      <div
        className="h-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
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
  const pct = Math.max(0, Math.min(1, position)) * 100;
  return (
    <div>
      <div className="relative h-3 w-full rounded bg-gray-200">
        {/* Center tick */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-400" />
        {/* Marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function BarRow({ entry }: { entry: RiderBarValue }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3 mb-2">
      <div className="text-sm text-gray-700 truncate">
        {entry.category_name}
      </div>
      <ProgressBar value={entry.value} />
    </div>
  );
}

function SliderRow({ entry }: { entry: RiderSliderValue }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-3 mb-2">
      <div className="text-sm text-gray-700 truncate pt-0.5">
        {entry.category_name}
      </div>
      <PreferenceSlider
        position={entry.position}
        lowLabel={entry.low_label}
        highLabel={entry.high_label}
      />
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

  try {
    const { rides, categoriesByStage, categories, stageLengthRank } =
      await fetchAllData();
    const result = buildAggregations(
      rides,
      categoriesByStage,
      categories,
      stageLengthRank,
    );
    allBars = result.bars;
    allSliders = result.sliders;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Rider profile</h2>
        <p className="text-red-600 text-sm">Error: {errorMsg}</p>
      </section>
    );
  }

  const bars = buildBarValues(allBars, personId);
  const sliders = buildSliderValues(allSliders, personId);

  const entries: RiderProfileEntry[] = [...bars, ...sliders].sort(
    (a, b) => a.display_order - b.display_order,
  );

  if (entries.length === 0) return null;

  return (
    <section className="mb-8">
      {entries.map((entry) =>
        entry.kind === "bar" ? (
          <BarRow key={entry.category_id} entry={entry} />
        ) : (
          <SliderRow key={entry.category_id} entry={entry} />
        ),
      )}
    </section>
  );
}