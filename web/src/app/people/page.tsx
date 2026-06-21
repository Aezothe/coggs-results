import { getServiceClient } from "@/lib/supabase/server";
import { PeopleList } from "./PeopleList";

export const dynamic = "force-dynamic";

export type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  event_count: number;
};

/**
 * Paginated select helper — Supabase caps responses at 1000 rows by default.
 */
async function fetchAll<T>(
  table: string,
  columns: string,
): Promise<T[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function fetchPeopleWithEventCounts(): Promise<PersonRow[]> {
  // 1. competitor.id → person.id mapping
  const competitors = await fetchAll<{ id: string; person_id: string | null }>(
    "competitor",
    "id, person_id",
  );
  const personByCompetitor = new Map<string, string>();
  for (const c of competitors) {
    if (c.person_id) personByCompetitor.set(c.id, c.person_id);
  }

  // 2. (competitor_id, event_id) pairs from standings.
  //    Using standings means "actually has a result row," not just "registered."
  const standingsRows = await fetchAll<{
    competitor_id: string;
    event_id: string;
  }>("standings", "competitor_id, event_id");

  // 3. Aggregate distinct event_ids per person_id.
  const eventsByPerson = new Map<string, Set<string>>();
  for (const row of standingsRows) {
    const personId = personByCompetitor.get(row.competitor_id);
    if (!personId) continue;
    let set = eventsByPerson.get(personId);
    if (!set) {
      set = new Set<string>();
      eventsByPerson.set(personId, set);
    }
    set.add(row.event_id);
  }

  // 4. Fetch only the people who have at least one event.
  const supabase = getServiceClient();
  const activePersonIds = Array.from(eventsByPerson.keys());
  if (activePersonIds.length === 0) return [];

  // .in() has a practical limit (~1000 ids), so chunk if necessary.
  const chunkSize = 500;
  const peopleRows: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }> = [];
  for (let i = 0; i < activePersonIds.length; i += chunkSize) {
    const chunk = activePersonIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("person")
      .select("id, first_name, last_name")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    peopleRows.push(...(data ?? []));
  }

  // 5. Attach counts and sort.
  return peopleRows
    .map((p) => ({
      ...p,
      event_count: eventsByPerson.get(p.id)?.size ?? 0,
    }))
    .sort((a, b) => {
      if (b.event_count !== a.event_count) return b.event_count - a.event_count;
      const al = (a.last_name ?? "").localeCompare(b.last_name ?? "");
      if (al !== 0) return al;
      return (a.first_name ?? "").localeCompare(b.first_name ?? "");
    });
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
      <h1 className="text-2xl font-semibold mb-1">People</h1>
      <p className="text-sm text-gray-500 mb-6">
        {people.length} competitor{people.length === 1 ? "" : "s"}
      </p>
      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}
      {!errorMsg && <PeopleList people={people} />}
    </main>
  );
}