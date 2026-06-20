import { getServiceClient } from "@/lib/supabase/server";
import { PeopleList } from "./PeopleList";

export const dynamic = "force-dynamic";

export type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

async function fetchAllPeople(): Promise<PersonRow[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: PersonRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("person")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as PersonRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export default async function PeoplePage() {
  let people: PersonRow[] = [];
  let errorMsg: string | null = null;
  try {
    people = await fetchAllPeople();
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">People</h1>
      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}
      {!errorMsg && <PeopleList people={people} />}
    </main>
  );
}