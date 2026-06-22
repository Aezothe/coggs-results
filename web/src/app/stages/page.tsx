import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StageRow = {
  id: string;
  name: string;
  event_appearances: number;
};

async function fetchStages(): Promise<StageRow[]> {
  const supabase = getServiceClient();

  // Pull every catalog stage + its segments. We aggregate in JS instead of SQL
  // because Supabase's REST API doesn't expose group-by directly.
  const { data, error } = await supabase
    .from("stage")
    .select("id, name, segment(id, kind)")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => {
    const segs = (s.segment ?? []) as Array<{ kind: string }>;
    const appearances = segs.filter((seg) => seg.kind === "stage").length;
    return {
      id: s.id as string,
      name: s.name as string,
      event_appearances: appearances,
    };
  });
}

export default async function StagesPage() {
  let stages: StageRow[] = [];
  let errorMsg: string | null = null;
  try {
    stages = await fetchStages();
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  // Only show stages that have actually been used in events.
  const used = stages.filter((s) => s.event_appearances > 0);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Stages</h1>
      <p className="text-sm text-gray-500 mb-6">
        {used.length} stage{used.length === 1 ? "" : "s"} used across events
      </p>

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}

      {!errorMsg && used.length === 0 && (
        <p className="text-gray-500">No stages yet.</p>
      )}

      {used.length > 0 && (
        <ul className="divide-y divide-gray-200">
          {used.map((s) => (
            <li key={s.id}>
              <Link
                href={`/stages/${s.id}`}
                className="py-2 flex justify-between items-center hover:bg-gray-50 px-2 -mx-2 rounded"
              >
                <span className="text-gray-900">{s.name}</span>
                <span className="text-sm text-gray-500 tabular-nums">
                  {s.event_appearances} event
                  {s.event_appearances === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}