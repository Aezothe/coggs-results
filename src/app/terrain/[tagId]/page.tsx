import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";
import { TerrainStagesTable, type StageWithCounts } from "./TerrainStagesTable";

export const dynamic = "force-dynamic";

type TagRow = {
  id: string;
  name: string;
  category: string;
};

async function fetchTag(tagId: string): Promise<TagRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("tag")
    .select("id, name, category")
    .eq("id", tagId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TagRow | null) ?? null;
}

async function fetchStagesForTag(tagId: string): Promise<StageWithCounts[]> {
  const supabase = getServiceClient();

  const { data: joinData, error: joinErr } = await supabase
    .from("stage_tag")
    .select("stage_id")
    .eq("tag_id", tagId);
  if (joinErr) throw new Error(joinErr.message);

  const stageIds = (joinData ?? []).map((r) => r.stage_id as string);
  if (stageIds.length === 0) return [];

  const { data: stageRows, error: stageErr } = await supabase
    .from("stage")
    .select("id, name")
    .in("id", stageIds);
  if (stageErr) throw new Error(stageErr.message);

  const pageSize = 1000;
  const rideRows: { stage_id: string; event_id: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("event_stage_times")
      .select("stage_id, event_id")
      .in("stage_id", stageIds)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rideRows.push(...(data as { stage_id: string; event_id: string }[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const ridesByStage = new Map<string, number>();
  const eventsByStage = new Map<string, Set<string>>();
  for (const row of rideRows) {
    ridesByStage.set(row.stage_id, (ridesByStage.get(row.stage_id) ?? 0) + 1);
    if (!eventsByStage.has(row.stage_id)) {
      eventsByStage.set(row.stage_id, new Set());
    }
    eventsByStage.get(row.stage_id)!.add(row.event_id);
  }

  return ((stageRows ?? []) as { id: string; name: string }[]).map((s) => ({
    id: s.id,
    name: s.name,
    events: eventsByStage.get(s.id)?.size ?? 0,
    rides: ridesByStage.get(s.id) ?? 0,
  }));
}

export default async function TerrainDetailPage({
  params,
}: {
  params: Promise<{ tagId: string }>;
}) {
  const { tagId } = await params;

  const tag = await fetchTag(tagId);
  if (!tag) notFound();

  let stages: StageWithCounts[] = [];
  let errorMsg: string | null = null;
  try {
    stages = await fetchStagesForTag(tagId);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <nav className="mb-2 text-sm">
        <Link href="/terrain"
          className="text-page-foreground hover:underline"
        >
          ← All terrain
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        {tag.name}
      </h1>
      <p className="text-sm text-page-muted mb-6">
        {tag.category} · {stages.length} stage{stages.length === 1 ? "" : "s"}
      </p>

      {errorMsg && <p className="text-danger mb-4">Error: {errorMsg}</p>}

      {!errorMsg && stages.length === 0 && (
        <p className="text-page-muted">
          No stages tagged with {tag.name} yet.
        </p>
      )}

      {stages.length > 0 && (
        <div className="rounded-lg p-4 border bg-surface border-surface-border">
          <TerrainStagesTable stages={stages} />
        </div>
      )}
    </main>
  );
}