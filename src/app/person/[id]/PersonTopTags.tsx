import { getServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

const TOP_N = 4;
const MIN_RIDES_PER_TAG = 3;

// Tag names to exclude (already represented in the rider profile bars).
// Match is case-insensitive.
const EXCLUDED_TAG_NAMES = new Set(["pedaly", "steep"]);

type StageRide = {
  stage_id: string;
  stage_position_class: number | null;
  finishers_class: number | null;
  time_ms: number | null;
};

type StageTagJoin = {
  stage_id: string;
  tag: { id: string; name: string; category: string } | null;
};

type TopTag = {
  tag_id: string;
  tag_name: string;
  avg_percentile: number;
  rides: number;
};

function percentile(position: number, finishers: number): number | null {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

async function fetchRides(personId: string): Promise<StageRide[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event_stage_times")
    .select("stage_id, stage_position_class, finishers_class, time_ms")
    .eq("person_id", personId);
  if (error) throw new Error(error.message);
  return (data ?? []) as StageRide[];
}

async function fetchStageTags(stageIds: string[]): Promise<StageTagJoin[]> {
  if (stageIds.length === 0) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("stage_tag")
    .select("stage_id, tag:tag_id(id, name, category)")
    .in("stage_id", stageIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StageTagJoin[];
}

function computeTopTags(
  rides: StageRide[],
  stageTags: StageTagJoin[],
): TopTag[] {
  // Build stage_id -> [{ id, name }]
  const tagsByStage = new Map<string, { id: string; name: string }[]>();
  const seen = new Map<string, Set<string>>();
  for (const row of stageTags) {
    if (!row.tag) continue;
    if (row.tag.category !== "terrain") continue;
    if (EXCLUDED_TAG_NAMES.has(row.tag.name.toLowerCase())) continue;

    if (!tagsByStage.has(row.stage_id)) {
      tagsByStage.set(row.stage_id, []);
      seen.set(row.stage_id, new Set());
    }
    const seenSet = seen.get(row.stage_id)!;
    if (seenSet.has(row.tag.id)) continue;
    seenSet.add(row.tag.id);
    tagsByStage.get(row.stage_id)!.push({ id: row.tag.id, name: row.tag.name });
  }

  // Accumulate percentiles per tag
  type Slot = { name: string; pcts: number[] };
  const byTag = new Map<string, Slot>();
  for (const r of rides) {
    if (r.time_ms == null) continue;
    if (r.stage_position_class == null) continue;
    if (r.finishers_class == null) continue;
    const pct = percentile(r.stage_position_class, r.finishers_class);
    if (pct == null) continue;

    const tags = tagsByStage.get(r.stage_id);
    if (!tags || tags.length === 0) continue;

    for (const t of tags) {
      if (!byTag.has(t.id)) byTag.set(t.id, { name: t.name, pcts: [] });
      byTag.get(t.id)!.pcts.push(pct);
    }
  }

  // Filter to tags with enough rides, sort by avg percentile desc
  const out: TopTag[] = [];
  for (const [tag_id, slot] of byTag.entries()) {
    if (slot.pcts.length < MIN_RIDES_PER_TAG) continue;
    out.push({
      tag_id,
      tag_name: slot.name,
      avg_percentile: slot.pcts.reduce((a, b) => a + b, 0) / slot.pcts.length,
      rides: slot.pcts.length,
    });
  }
  out.sort((a, b) => b.avg_percentile - a.avg_percentile);
  return out.slice(0, TOP_N);
}

export async function PersonTopTags({ personId }: { personId: string }) {
  let rides: StageRide[] = [];
  let stageTags: StageTagJoin[] = [];
  let errorMsg: string | null = null;

  try {
    rides = await fetchRides(personId);
    const stageIds = Array.from(new Set(rides.map((r) => r.stage_id)));
    stageTags = await fetchStageTags(stageIds);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) return null;

  const topTags = computeTopTags(rides, stageTags);
  if (topTags.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="surface-dark rounded-lg p-4 border bg-surface border-surface-border max-w-md mx-auto">
        <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-surface-muted">
          Top Tags
        </h3>

        <div className="flex flex-wrap gap-2">
          {topTags.map((t) => (
            <Link href={`/terrain/${t.tag_id}`}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-surface-emphasis text-surface-foreground hover:bg-surface-hover transition-colors"
            >
              {t.tag_name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}