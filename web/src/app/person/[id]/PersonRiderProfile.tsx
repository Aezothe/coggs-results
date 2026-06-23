import { getServiceClient } from "@/lib/supabase/server";
import { TagPill } from "@/components/TagPill";

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

type TagAggregation = {
  tag_id: string;
  tag_name: string;
  avg_percentile: number;
  rides: number;
  stages: number;
};

function percentile(position: number, finishers: number): number {
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

function aggregateByTag(
  rides: StageRide[],
  stageTags: StageTagJoin[],
): TagAggregation[] {
  // Build: stage_id -> Set<{tag_id, tag_name}>
  const tagsByStage = new Map<
    string,
    Map<string, { name: string; category: string }>
  >();
  for (const row of stageTags) {
    if (!row.tag) continue;
    if (row.tag.category !== "terrain") continue;
    if (!tagsByStage.has(row.stage_id)) {
      tagsByStage.set(row.stage_id, new Map());
    }
    tagsByStage
      .get(row.stage_id)!
      .set(row.tag.id, { name: row.tag.name, category: row.tag.category });
  }

  // For each ride, look up its stage's tags, push the percentile onto each tag.
  // tag_id -> { name, percentiles[], stages: Set<stage_id> }
  const byTag = new Map<
    string,
    { name: string; percentiles: number[]; stages: Set<string> }
  >();

  for (const r of rides) {
    if (r.time_ms == null) continue; // DNF on this stage
    if (r.stage_position_class == null || r.finishers_class == null) continue;

    const tags = tagsByStage.get(r.stage_id);
    if (!tags) continue;

    const pct = percentile(r.stage_position_class, r.finishers_class);

    for (const [tag_id, { name }] of tags.entries()) {
      if (!byTag.has(tag_id)) {
        byTag.set(tag_id, { name, percentiles: [], stages: new Set() });
      }
      const slot = byTag.get(tag_id)!;
      slot.percentiles.push(pct);
      slot.stages.add(r.stage_id);
    }
  }

  const result: TagAggregation[] = [];
  for (const [tag_id, slot] of byTag.entries()) {
    if (slot.percentiles.length === 0) continue;
    const sum = slot.percentiles.reduce((a, b) => a + b, 0);
    result.push({
      tag_id,
      tag_name: slot.name,
      avg_percentile: sum / slot.percentiles.length,
      rides: slot.percentiles.length,
      stages: slot.stages.size,
    });
  }

  result.sort((a, b) => b.avg_percentile - a.avg_percentile);
  return result;
}

export async function PersonRiderProfile({
  personId,
}: {
  personId: string;
}) {
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

const MIN_RIDES = 3;
const aggregations = aggregateByTag(rides, stageTags);
const qualified = aggregations.filter((t) => t.rides >= MIN_RIDES);
const top5 = qualified.slice(0, 5);

  // Don't render the section at all if there's nothing meaningful to show.
  if (errorMsg || top5.length === 0) {
    if (errorMsg) {
      return (
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Rider profile</h2>
          <p className="text-red-600 text-sm">Error: {errorMsg}</p>
        </section>
      );
    }
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-medium mb-3">Top terrain</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Tag</th>
              <th className="text-right px-3 py-2">Avg percentile</th>
              <th className="text-right px-3 py-2">Rides</th>
              <th className="text-right px-3 py-2">Stages</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {top5.map((t) => (
              <tr key={t.tag_id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                    <TagPill id={t.tag_id} name={t.tag_name} />
                    </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(t.avg_percentile * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {t.rides}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {t.stages}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}