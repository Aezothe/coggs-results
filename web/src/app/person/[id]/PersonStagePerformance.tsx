import { getServiceClient } from "@/lib/supabase/server";
import { PersonStagePerformanceTable } from "./PersonStagePerformanceTable";

type StageRide = {
  stage_id: string;
  stage_name: string;
  time_ms: number | null;
  stage_position: number | null;
  finishers_on_stage: number | null;
};

type StageSummary = {
  stage_id: string;
  stage_name: string;
  best_percentile: number;
  avg_percentile: number;
  rides: number;
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

function percentile(position: number, finishers: number): number | null {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

function summarizeStages(rides: StageRide[]): StageSummary[] {
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
  let errorMsg: string | null = null;

  try {
    rides = await fetchStageRides(personId);
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

  const summaries = summarizeStages(rides);

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