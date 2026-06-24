import { getServiceClient } from "@/lib/supabase/server";

// How many to show in each section. Easy to change.
const SHOW_STRENGTHS = 3;
const SHOW_CHALLENGES = 2;

// Minimum rides on a tag for it to count.
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

type StageTagJoin = {
  stage_id: string;
  tag: { id: string; name: string; category: string } | null;
};

type TagPerRider = {
  person_id: string;
  tag_id: string;
  tag_name: string;
  avg_percentile: number;
  rides: number;
};

type RiderTagBar = {
  tag_id: string;
  tag_name: string;
  bar_value: number; // 0..1 — the composite
};

function percentile(position: number, finishers: number): number {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

async function fetchAllRidesWithTags(): Promise<{
  rides: StageRide[];
  tagsByStage: Map<string, { id: string; name: string }[]>;
}> {
  const supabase = getServiceClient();

  // All stage rides for everyone in the system
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

  // Stage tags (terrain only — filtered after fetch)
  const { data: tagJoinData, error: tagErr } = await supabase
    .from("stage_tag")
    .select("stage_id, tag:tag_id(id, name, category)");
  if (tagErr) throw new Error(tagErr.message);

  const tagsByStage = new Map<string, { id: string; name: string }[]>();
  for (const row of (tagJoinData ?? []) as unknown as StageTagJoin[]) {
    if (!row.tag) continue;
    if (row.tag.category !== "terrain") continue;
    if (!tagsByStage.has(row.stage_id)) tagsByStage.set(row.stage_id, []);
    tagsByStage
      .get(row.stage_id)!
      .push({ id: row.tag.id, name: row.tag.name });
  }

  return { rides, tagsByStage };
}

function buildTagAggregations(
  rides: StageRide[],
  tagsByStage: Map<string, { id: string; name: string }[]>,
): TagPerRider[] {
  // Group: person_id → tag_id → { name, percentiles[] }
  const acc = new Map<
    string,
    Map<string, { name: string; pcts: number[] }>
  >();

  for (const r of rides) {
    if (!r.person_id) continue;
    if (r.time_ms == null) continue;
    if (r.stage_position_class == null || r.finishers_class == null) continue;

    const stageTags = tagsByStage.get(r.stage_id);
    if (!stageTags || stageTags.length === 0) continue;

    const pct = percentile(r.stage_position_class, r.finishers_class);

    if (!acc.has(r.person_id)) acc.set(r.person_id, new Map());
    const inner = acc.get(r.person_id)!;

    for (const t of stageTags) {
      if (!inner.has(t.id)) inner.set(t.id, { name: t.name, pcts: [] });
      inner.get(t.id)!.pcts.push(pct);
    }
  }

  const out: TagPerRider[] = [];
  for (const [person_id, tagMap] of acc.entries()) {
    for (const [tag_id, { name, pcts }] of tagMap.entries()) {
      if (pcts.length === 0) continue;
      out.push({
        person_id,
        tag_id,
        tag_name: name,
        avg_percentile: pcts.reduce((a, b) => a + b, 0) / pcts.length,
        rides: pcts.length,
      });
    }
  }

  return out;
}

function buildBarValues(
  allAggregations: TagPerRider[],
  personId: string,
): RiderTagBar[] {
  // Find this rider's qualifying tags
  const riderTags = allAggregations.filter(
    (a) => a.person_id === personId && a.rides >= MIN_RIDES,
  );
  if (riderTags.length === 0) return [];

  // ---- Field position signal ----
  // For each tag, what's the distribution of avg_percentile across all riders?
  // We use a simple percentile-of-percentiles: rank the rider's avg among the field.
  const fieldByTag = new Map<string, number[]>();
  for (const a of allAggregations) {
    if (a.rides < MIN_RIDES) continue;
    if (!fieldByTag.has(a.tag_id)) fieldByTag.set(a.tag_id, []);
    fieldByTag.get(a.tag_id)!.push(a.avg_percentile);
  }
  // Sort each tag's field
  for (const arr of fieldByTag.values()) {
    arr.sort((a, b) => a - b);
  }

  function fieldRank(tag_id: string, value: number): number {
    const arr = fieldByTag.get(tag_id);
    if (!arr || arr.length < 2) return 0.5; // not enough field data, neutral
    // Count how many in the field this rider's value beats
    let below = 0;
    for (const v of arr) {
      if (v < value) below++;
      else break;
    }
    return below / (arr.length - 1);
  }

  // ---- Personal relative signal ----
  // How does this tag's avg compare to this rider's overall tag-weighted avg?
  // Normalized within their own range.
  const riderValues = riderTags.map((t) => t.avg_percentile);
  const riderMin = Math.min(...riderValues);
  const riderMax = Math.max(...riderValues);
  const riderSpread = riderMax - riderMin;

  function personalRank(value: number): number {
    if (riderSpread < 0.01) return 0.5; // all tags equal, neutral
    return (value - riderMin) / riderSpread;
  }

  // ---- Composite ----
  const bars: RiderTagBar[] = riderTags.map((t) => {
    const field = fieldRank(t.tag_id, t.avg_percentile);
    const personal = personalRank(t.avg_percentile);
    return {
      tag_id: t.tag_id,
      tag_name: t.tag_name,
      bar_value: FIELD_WEIGHT * field + PERSONAL_WEIGHT * personal,
    };
  });

  // Sort by composite descending — best first
  bars.sort((a, b) => b.bar_value - a.bar_value);

  return bars;
}

function ProgressBar({
  value,
  variant,
}: {
  value: number; // 0..1
  variant: "strength" | "challenge";
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color =
    variant === "strength"
      ? "bg-emerald-500"
      : "bg-amber-500";
  return (
    <div className="h-3 w-full rounded bg-gray-200 overflow-hidden">
      <div
        className={`h-full ${color} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TagBarRow({
  name,
  value,
  variant,
}: {
  name: string;
  value: number;
  variant: "strength" | "challenge";
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3 mb-2">
      <div className="text-sm text-gray-700 truncate">{name}</div>
      <ProgressBar value={value} variant={variant} />
    </div>
  );
}

export async function PersonRiderProfile({
  personId,
}: {
  personId: string;
}) {
  let allAggregations: TagPerRider[] = [];
  let errorMsg: string | null = null;

  try {
    const { rides, tagsByStage } = await fetchAllRidesWithTags();
    allAggregations = buildTagAggregations(rides, tagsByStage);
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

  const strengths = bars.slice(0, SHOW_STRENGTHS);
  const challenges = bars
    .slice(-SHOW_CHALLENGES)
    .reverse(); // worst first within challenges? we want best-of-worst at top

  // Don't double-show if strengths and challenges overlap (very few tags)
  const strengthsIds = new Set(strengths.map((s) => s.tag_id));
  const dedupedChallenges = challenges.filter(
    (c) => !strengthsIds.has(c.tag_id),
  );

  return (
    <section className="mb-8">
      {strengths.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Strengths</h3>
          {strengths.map((s) => (
            <TagBarRow
              key={s.tag_id}
              name={s.tag_name}
              value={s.bar_value}
              variant="strength"
            />
          ))}
        </div>
      )}

      {dedupedChallenges.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Challenges</h3>
          {dedupedChallenges.map((c) => (
            <TagBarRow
              key={c.tag_id}
              name={c.tag_name}
              value={c.bar_value}
              variant="challenge"
            />
          ))}
        </div>
      )}
    </section>
  );
}