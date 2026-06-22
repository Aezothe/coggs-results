import { getServiceClient } from "@/lib/supabase/server";
import { PersonStagePerformanceTable } from "./PersonStagePerformanceTable";

type StageRide = {
  stage_id: string;
  stage_name: string;
  time_ms: number | null;
  stage_position: number | null;
  finishers_on_stage: number | null;
};

type StageTagJoin = {
  stage_id: string;
  tag: { id: string; name: string; category: string } | null;
};

export type StageTag = {
  id: string;
  name: string;
};

export type StageSummary = {
  stage_id: string;
  stage_name: string;
  best_percentile: number;
  avg_percentile: number;
  rides: number;
  tags: StageTag[];
};

async function fetchStageRides(personId: string): Promise<StageRide[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event_stage_times")
    .select(
      "stage_id, stage_name, time_ms, stage_position, finishers_on_stage",
    )
    .eq("person_id", personId);

  if (error) throw new Error(error.message);
  return (data ?? []) as StageRide[];
}

async function fetchStageTagsForStages(
  stageIds: string[],
): Promise<StageTagJoin[]> {
  if (stageIds.length === 0) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("stage_tag")
    .select("stage_id, tag:tag_id(id, name, category)")
    .in("stage_id", stageIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StageTagJoin[];
}

function percentile(position: number, finishers: number): number | null {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

function summarizeStages(
  rides: StageRide[],
  stageTags: StageTagJoin[],
): StageSummary[] {
  // Build stage_id -> list of terrain tags (alpha sorted)
  const tagsByStage = new Map<string, StageTag[]>();
  const seen = new Map<string, Set<string>>(); // dedupe per stage
  for (const row of stageTags) {
    if (!row.tag) continue;
    if (row.tag.category !== "terrain") continue;
    if (!tagsByStage.has(row.stage_id)) {
      tagsByStage.set(row.stage_id, []);
      seen.set(row.stage_id, new Set());
    }
    const seenSet = seen.get(row.stage_id)!;
    if (seenSet.has(row.tag.id)) continue;
    seenSet.add(row.tag.id);
    tagsByStage.get(row.stage_id)!.push({ id: row.tag.id, name: row.tag.name });
  }
  for (const arr of tagsByStage.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const byStage = new Map<string, { name: string; pcts: number[] }>();

  for (const r of rides) {
    if (r.time_ms == null) continue;
    if (r.stage_position == null) continue;
    if (r.finishers_on_stage == null) continue;

    const pct = percentile(r.stage_position, r.finishers_on_stage);
    if (pct == null) continue;

    if (!byStage.has(r.stage_id)) {
      byStage.set(r.stage_id, { name: r.stage_name, pcts: [] });
    }
    byStage.get(r.stage_id)!.pcts.push(pct);
  }

  const summaries: StageSummary[] = [];
  for (const [stage_id, { name, pcts }] of byStage.entries()) {
    if (pcts.length === 0) continue;
    summaries.push({
      stage_id,
      stage_name: name,
      best_percentile: Math.max(...pcts),
      avg_percentile: pcts.reduce((a, b) => a + b, 0) / pcts.length,
      rides: pcts.length,
      tags: tagsByStage.get(stage_id) ?? [],
    });
  }

  return summaries;
}

export async function PersonStagePerformance({
  personId,
}: {
  personId: string;
}) {
  let rides: StageRide[] = [];
  let stageTags: StageTagJoin[] = [];
  let errorMsg: string | null = null;

  try {
    rides = await fetchStageRides(personId);
    const stageIds = Array.from(new Set(rides.map((r) => r.stage_id)));
    stageTags = await fetchStageTagsForStages(stageIds);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) {
    return (
      <section className="mt-10">
        <h2 className="text-lg font-medium mb-3">Stage performance</h2>
        <p className="text-red-600 text-sm">Error: {errorMsg}</p>
      </section>
    );
  }

  const summaries = summarizeStages(rides, stageTags);

  if (summaries.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-lg font-medium mb-3">Stage performance</h2>
        <p className="text-sm text-gray-500">
          No stage results yet for this rider.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium mb-3">Stage performance</h2>
      <p className="text-sm text-gray-500 mb-3">
        Stages ranked by best finish percentile across all rides.
      </p>
      <PersonStagePerformanceTable summaries={summaries} />
    </section>
  );
}