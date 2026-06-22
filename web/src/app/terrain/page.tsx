import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";

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

type TerrainSummary = {
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

  // tag_id -> Set<stage_id>
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

  summaries.sort((a, b) => {
    if (b.stage_count !== a.stage_count) return b.stage_count - a.stage_count;
    return a.name.localeCompare(b.name);
  });

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
      <h1 className="text-2xl font-semibold mb-1">Terrain</h1>
      <p className="text-sm text-gray-500 mb-6">
        {tags.length} terrain type{tags.length === 1 ? "" : "s"} in use
      </p>

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}

      {!errorMsg && tags.length === 0 && (
        <p className="text-gray-500">No terrain tags in use yet.</p>
      )}

      {tags.length > 0 && (
        <ul className="divide-y divide-gray-200">
          {tags.map((t) => (
            <li key={t.id}>
              <Link href={`/terrain/${t.id}`}
                className="flex items-center justify-between py-2 hover:bg-gray-50 px-2 -mx-2 rounded"
              >
                <span className="text-gray-900">{t.name}</span>
                <span className="text-sm text-gray-500 tabular-nums">
                  {t.stage_count} stage{t.stage_count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}