import { getServiceClient } from "@/lib/supabase/server";
import { PeopleList } from "./PeopleList";

export const dynamic = "force-dynamic";

export type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  event_count: number;
};

async function fetchPeopleWithEventCounts(): Promise<PersonRow[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("person_summary")
    .select("id, first_name, last_name, event_count")
    .gt("event_count", 0)
    .order("event_count", { ascending: false })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    event_count: Number(row.event_count ?? 0),
  }));
}

export default async function PeoplePage() {
  let people: PersonRow[] = [];
  let errorMsg: string | null = null;

  try {
    people = await fetchPeopleWithEventCounts();
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        People
      </h1>
      <p className="text-sm text-page-muted mb-6">
        {people.length} competitor{people.length === 1 ? "" : "s"}
      </p>

      {errorMsg && <p className="text-danger mb-4">Error: {errorMsg}</p>}

      {!errorMsg && (
        <div className="rounded-lg p-4 border bg-surface border-surface-border">
          <PeopleList people={people} />
        </div>
      )}
    </main>
  );
}