import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";
import { PersonStagePerformance } from "./PersonStagePerformance";
import { PersonRiderProfile } from "./PersonRiderProfile";
import { PersonResultsSection } from "./PersonResultsSection";

export const dynamic = "force-dynamic";

type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type PersonResult = {
  entry_id: string;
  event_id: string;
  event_name: string | null;
  event_date: string | null;
  course_name: string | null;
  class_name: string | null;
  total_time_ms: number | null;
  is_dnf: boolean | null;
  position: number | null;
  percentile: number | null;
};

async function fetchPerson(id: string): Promise<Person | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("person")
    .select("id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Person | null) ?? null;
}

async function fetchPersonResults(personId: string): Promise<PersonResult[]> {
  const supabase = getServiceClient();

  // 1. person.id -> competitor.id[]
  const { data: competitors, error: cErr } = await supabase
    .from("competitor")
    .select("id")
    .eq("person_id", personId);
  if (cErr) throw new Error(cErr.message);

  const competitorIds = (competitors ?? []).map((c) => c.id as string);
  if (competitorIds.length === 0) return [];

  // 2. standings + event name in a single query via nested select
  const { data: standingsRows, error: sErr } = await supabase
    .from("standings")
    .select(
      "entry_id, event_id, event_date, course_name, class_name, total_time_ms, is_dnf, position, percentile, event:event_id(name)",
    )
    .in("competitor_id", competitorIds)
    .order("event_date", { ascending: false });
  if (sErr) throw new Error(sErr.message);

  type JoinRow = {
    entry_id: string;
    event_id: string;
    event_date: string | null;
    course_name: string | null;
    class_name: string | null;
    total_time_ms: number | null;
    is_dnf: boolean | null;
    position: number | null;
    percentile: number | null;
    event: { name: string | null } | null;
  };

  return ((standingsRows ?? []) as unknown as JoinRow[]).map((r) => ({
    entry_id: r.entry_id,
    event_id: r.event_id,
    event_name: r.event?.name ?? null,
    event_date: r.event_date,
    course_name: r.course_name,
    class_name: r.class_name,
    total_time_ms: r.total_time_ms,
    is_dnf: r.is_dnf ?? false,
    position: r.position,
    percentile: r.percentile,
  })) as PersonResult[];
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const person = await fetchPerson(id);
  if (!person) notFound();

  let results: PersonResult[] = [];
  let errorMsg: string | null = null;
  try {
    results = await fetchPersonResults(id);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const displayName =
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    "Unnamed";

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">{displayName}</h1>

      <PersonRiderProfile personId={id} />

      <PersonStagePerformance personId={id} />

      {results.length > 0 && <PersonResultsSection results={results} />}

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}
      {!errorMsg && results.length === 0 && (
        <p className="text-gray-500">No results found for this person.</p>
      )}
    </main>
  );
}