import { getServiceClient } from "@/lib/supabase/server";
import { TerrainList } from "./TerrainList";

export const dynamic = "force-dynamic";

type TagRow = {
  id: string;
  name: string;
  category: string;
};

type StageTagRow = {
  tag_id: string;
  stage_id: string;
};

export type TerrainSummary = {
  id: string;
  name: string;
  stage_count: number;
};

async function fetchUsedTerrainTags(): Promise<TerrainSummary[]> {
  const supabase = getServiceClient();

  const [tagsResp, joinResp] = await Promise.all([
    supabase
      .from("tag")
      .select("id, name, category")
      .eq("category", "terrain"),
    supabase.from("stage_tag").select("tag_id, stage_id"),
  ]);

  if (tagsResp.error) throw new Error(tagsResp.error.message);
  if (joinResp.error) throw new Error(joinResp.error.message);

  const tags = (tagsResp.data ?? []) as TagRow[];
  const join = (joinResp.data ?? []) as StageTagRow[];

  const stagesByTag = new Map<string, Set<string>>();
  for (const row of join) {
    if (!stagesByTag.has(row.tag_id)) {
      stagesByTag.set(row.tag_id, new Set());
    }
    stagesByTag.get(row.tag_id)!.add(row.stage_id);
  }

  const summaries: TerrainSummary[] = [];
  for (const t of tags) {
    const stages = stagesByTag.get(t.id);
    if (!stages || stages.size === 0) continue;
    summaries.push({
      id: t.id,
      name: t.name,
      stage_count: stages.size,
    });
  }

  return summaries;
}

export default async function TerrainPage() {
  let tags: TerrainSummary[] = [];
  let errorMsg: string | null = null;
  try {
    tags = await fetchUsedTerrainTags();
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        Terrain
      </h1>
      <p className="text-sm text-page-muted mb-6">
        {tags.length} terrain type{tags.length === 1 ? "" : "s"} in use
      </p>

      {errorMsg && <p className="text-danger mb-4">Error: {errorMsg}</p>}

      {!errorMsg && tags.length === 0 && (
        <p className="text-page-muted">No terrain tags in use yet.</p>
      )}

      {tags.length > 0 && (
        <div className="rounded-lg p-4 border bg-surface border-surface-border">
          <TerrainList tags={tags} />
        </div>
      )}
    </main>
  );
}