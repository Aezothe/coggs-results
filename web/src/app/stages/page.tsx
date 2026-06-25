import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StageRow = {
  id: string;
  name: string;
  event_appearances: number;
  location_name: string | null;
};

type LocationGroup = {
  name: string;
  stages: StageRow[];
};

async function fetchStages(): Promise<StageRow[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("stage")
    .select("id, name, location:location_id(name), segment(id, kind)")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  type Raw = {
    id: string;
    name: string;
    location: { name: string } | null;
    segment: Array<{ kind: string }> | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((s) => {
    const segs = s.segment ?? [];
    const appearances = segs.filter((seg) => seg.kind === "stage").length;
    return {
      id: s.id,
      name: s.name,
      event_appearances: appearances,
      location_name: s.location?.name ?? null,
    };
  });
}

function groupByLocation(stages: StageRow[]): LocationGroup[] {
  const used = stages.filter((s) => s.event_appearances > 0);

  const byLocation = new Map<string, StageRow[]>();
  for (const s of used) {
    const key = s.location_name ?? "__other__";
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key)!.push(s);
  }

  for (const arr of byLocation.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const namedGroups: LocationGroup[] = [];
  let otherGroup: LocationGroup | null = null;

  for (const [key, arr] of byLocation.entries()) {
    if (key === "__other__") {
      otherGroup = { name: "Other", stages: arr };
    } else {
      namedGroups.push({ name: key, stages: arr });
    }
  }

  namedGroups.sort((a, b) => a.name.localeCompare(b.name));
  if (otherGroup) namedGroups.push(otherGroup);

  return namedGroups;
}

export default async function StagesPage() {
  let stages: StageRow[] = [];
  let errorMsg: string | null = null;
  try {
    stages = await fetchStages();
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const groups = groupByLocation(stages);
  const totalStages = groups.reduce((sum, g) => sum + g.stages.length, 0);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        Stages
      </h1>
      <p className="text-sm text-page-muted mb-6">
        {totalStages} stage{totalStages === 1 ? "" : "s"} used across events
      </p>

      {errorMsg && <p className="text-danger mb-4">Error: {errorMsg}</p>}

      {!errorMsg && groups.length === 0 && (
        <p className="text-page-muted">No stages yet.</p>
      )}

      {groups.map((g) => (
        <details
          key={g.name}
          className="border border-surface-border rounded-lg mb-3 group bg-surface overflow-hidden"
        >
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-surface-hover select-none list-none">
            <span className="flex items-center gap-2">
              <span className="text-surface-muted text-xs transition-transform group-open:rotate-90">
                ▶
              </span>
              <span className="font-medium text-surface-foreground">
                {g.name}
              </span>
            </span>
            <span className="text-sm text-surface-muted tabular-nums">
              {g.stages.length} stage{g.stages.length === 1 ? "" : "s"}
            </span>
          </summary>

          <ul className="divide-y divide-surface-border border-t border-surface-border">
            {g.stages.map((s) => (
              <li key={s.id}>
                <Link href={`/stages/${s.id}`}
                  className="flex items-center justify-between py-2 px-3 hover:bg-surface-hover"
                >
                  <span className="text-surface-foreground">{s.name}</span>
                  <span className="text-sm text-surface-muted tabular-nums">
                    {s.event_appearances} event
                    {s.event_appearances === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </main>
  );
}