import { getServiceClient } from "@/lib/supabase/server";
import { StagesList } from "./StagesList";

export const dynamic = "force-dynamic";

export type StageRow = {
  id: string;
  name: string;
  event_appearances: number;
  location_name: string | null;
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

export default async function StagesPage() {
  let stages: StageRow[] = [];
  let errorMsg: string | null = null;

  try {
    stages = await fetchStages();
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  // Only show stages that have been used in at least one event
  const used = stages.filter((s) => s.event_appearances > 0);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        Stages
      </h1>
      <p className="text-sm text-page-muted mb-6">
        {used.length} stage{used.length === 1 ? "" : "s"} used across events
      </p>

      {errorMsg && <p className="text-danger mb-4">Error: {errorMsg}</p>}

      {!errorMsg && used.length === 0 && (
        <p className="text-page-muted">No stages yet.</p>
      )}

      {used.length > 0 && (
        <div className="rounded-lg p-4 border bg-surface border-surface-border">
          <StagesList stages={used} />
        </div>
      )}
    </main>
  );
}