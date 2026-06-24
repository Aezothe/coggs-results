import { getServiceClient } from "@/lib/supabase/server";

// Minimum rides on a category for it to count.
const MIN_RIDES = 3;

// Composite weights — what portion of the bar reflects field position
// vs. the rider's own relative pattern.
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
};

type CategoryPerRider = {
  person_id: string;
  category_id: string;
  category_name: string;
  display_order: number;
  avg_percentile: number;
  rides: number;
};

type RiderCategoryBar = {
  category_id: string;
  category_name: string;
  display_order: number;
  bar_value: number;
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
    .select("id, name, display_order")
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

  return { rides, categoriesByStage, categories };
}

function buildCategoryAggregations(
  rides: StageRide[],
  categoriesByStage: Map<
    string,
    { id: string; name: string; display_order: number }[]
  >,
): CategoryPerRider[] {
  const acc = new Map<
    string,
    Map<string, { name: string; display_order: number; pcts: number[] }>
  >();

  for (const r of rides) {
    if (!r.person_id) continue;
    if (r.time_ms == null) continue;
    if (r.stage_position_class == null || r.finishers_class == null) continue;

    const cats = categoriesByStage.get(r.stage_id);
    if (!cats || cats.length === 0) continue;

    const pct = percentile(r.stage_position_class, r.finishers_class);

    if (!acc.has(r.person_id)) acc.set(r.person_id, new Map());
    const inner = acc.get(r.person_id)!;

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

  const out: CategoryPerRider[] = [];
  for (const [person_id, catMap] of acc.entries()) {
    for (const [category_id, slot] of catMap.entries()) {
      if (slot.pcts.length === 0) continue;
      out.push({
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

  return out;
}

function buildBarValues(
  allAggregations: CategoryPerRider[],
  personId: string,
): RiderCategoryBar[] {
  const riderCats = allAggregations.filter(
    (a) => a.person_id === personId && a.rides >= MIN_RIDES,
  );
  if (riderCats.length === 0) return [];

  const fieldByCat = new Map<string, number[]>();
  for (const a of allAggregations) {
    if (a.rides < MIN_RIDES) continue;
    if (!fieldByCat.has(a.category_id)) fieldByCat.set(a.category_id, []);
    fieldByCat.get(a.category_id)!.push(a.avg_percentile);
  }
  for (const arr of fieldByCat.values()) {
    arr.sort((a, b) => a - b);
  }

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

  const riderValues = riderCats.map((t) => t.avg_percentile);
  const riderMin = Math.min(...riderValues);
  const riderMax = Math.max(...riderValues);
  const riderSpread = riderMax - riderMin;

  function personalRank(value: number): number {
    if (riderSpread < 0.01) return 0.5;
    return (value - riderMin) / riderSpread;
  }

  const bars: RiderCategoryBar[] = riderCats.map((t) => {
    const field = fieldRank(t.category_id, t.avg_percentile);
    const personal = personalRank(t.avg_percentile);
    return {
      category_id: t.category_id,
      category_name: t.category_name,
      display_order: t.display_order,
      bar_value: FIELD_WEIGHT * field + PERSONAL_WEIGHT * personal,
    };
  });

  bars.sort((a, b) => a.display_order - b.display_order);

  return bars;
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

function CategoryBarRow({ name, value }: { name: string; value: number }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3 mb-2">
      <div className="text-sm text-gray-700 truncate">{name}</div>
      <ProgressBar value={value} />
    </div>
  );
}

export async function PersonRiderProfile({
  personId,
}: {
  personId: string;
}) {
  let allAggregations: CategoryPerRider[] = [];
  let errorMsg: string | null = null;

  try {
    const { rides, categoriesByStage } = await fetchAllData();
    allAggregations = buildCategoryAggregations(rides, categoriesByStage);
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

  const bars = buildBarValues(allAggregations, personId);

  if (bars.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      {bars.map((b) => (
        <CategoryBarRow
          key={b.category_id}
          name={b.category_name}
          value={b.bar_value}
        />
      ))}
    </section>
  );
}