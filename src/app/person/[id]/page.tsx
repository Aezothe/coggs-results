import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/server";
import { PersonStagePerformance } from "./PersonStagePerformance";
import { PersonRiderProfile } from "./PersonRiderProfile";
import { PersonResultsSection } from "./PersonResultsSection";
import { PersonTopTags } from "./PersonTopTags";

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

  const { data: competitors, error: cErr } = await supabase
    .from("competitor")
    .select("id")
    .eq("person_id", personId);
  if (cErr) throw new Error(cErr.message);

  const competitorIds = (competitors ?? []).map((c) => c.id as string);
  if (competitorIds.length === 0) return [];

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

function mostCommon<T extends PersonResult, K extends "course_name" | "class_name">(
  results: T[],
  key: K,
): string | null {
  const counts = new Map<string, { count: number; latest: number }>();
  for (const r of results) {
    const val = r[key];
    if (!val) continue;
    const ts = r.event_date ? new Date(r.event_date).getTime() : 0;
    const entry = counts.get(val);
    if (entry) {
      entry.count += 1;
      if (ts > entry.latest) entry.latest = ts;
    } else {
      counts.set(val, { count: 1, latest: ts });
    }
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort(
    (a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest,
  )[0][0];
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
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-accent-1">
          Rider Profile
        </div>
        <h1 className="text-3xl font-bold text-page-foreground">
          {displayName}
        </h1>
        {results.length > 0 && (() => {
        const pair = mostCommon(
          results.map((r) => ({
            ...r,
            combo: [r.course_name, r.class_name].filter(Boolean).join(" · ") || null,
          })) as never,
          "combo" as never,
        );
        return pair ? <p className="text-sm mt-1 text-page-muted">{pair}</p> : null;
      })()}
      </header>

      <PersonRiderProfile personId={id} />
      <PersonTopTags personId={id} />
      <PersonStagePerformance personId={id} />
      {results.length > 0 && <PersonResultsSection results={results} />}

      {errorMsg && <p className="mb-4 text-danger">Error: {errorMsg}</p>}
      {!errorMsg && results.length === 0 && (
        <p className="text-page-muted">No results found for this person.</p>
      )}
    </main>
  );
}