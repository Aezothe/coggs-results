import { getServiceClient } from "@/lib/supabase/server";
import { EventPicker } from "./EventPicker";
import { StandingsTable } from "./StandingsTable";

export const dynamic = "force-dynamic";

export type ScopeType = "overall" | "class" | "age";

export type StandingsRow = {
  entry_id: string;
  competitor_id: string;
  person_id: string | null;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  class_name: string | null;
  age_category: string | null;
  total_time_ms: number | null;
  is_dnf: boolean;
  scope_type: ScopeType;
  scope_value: string | null;
  position: number | null;
  percentile: number | null;
  winner_time_ms: number | null;
  time_back_ms: number | null;
  entrants_in_scope: number | null;
};

type EventOption = {
  id: string;
  name: string;
  event_date: string | null;
};

async function fetchEvents(): Promise<EventOption[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event")
    .select("id, name, event_date")
    .order("event_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventOption[];
}

async function fetchScopedStandings(
  eventId: string,
  scope: ScopeType,
): Promise<StandingsRow[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: StandingsRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
    .from("standings_scoped")
    .select(
      "entry_id, competitor_id, person_id, first_name, last_name, course_name, class_name, age_category, total_time_ms, is_dnf, scope_type, scope_value, position, percentile, winner_time_ms, time_back_ms, entrants_in_scope, finishers_in_scope",
    )
    .eq("event_id", eventId)
    .eq("scope_type", scope)
    .order("is_dnf", { ascending: true })        // finishers first
    .order("position", { ascending: true, nullsFirst: false })  // then by rank
    .order("last_name", { ascending: true })     // tiebreaker
    .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as StandingsRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

function isScope(v: string | undefined): v is ScopeType {
  return v === "overall" || v === "class" || v === "age";
}

function uniqueSorted(
  rows: StandingsRow[],
  key: "course_name" | "class_name",
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    event?: string;
    scope?: string;
    course?: string;
    class?: string;
  }>;
}) {
  const params = await searchParams;
  const events = await fetchEvents();

  if (events.length === 0) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Leaderboard</h1>
        <p className="text-gray-500">No events yet.</p>
      </main>
    );
  }

  const selectedEventId =
    params.event && events.some((e) => e.id === params.event)
      ? params.event
      : events[0].id;

  const selectedScope: ScopeType = isScope(params.scope)
    ? params.scope
    : "class";

  let standings: StandingsRow[] = [];
  let errorMsg: string | null = null;
  try {
    standings = await fetchScopedStandings(selectedEventId, selectedScope);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const courses = uniqueSorted(standings, "course_name");
  const classes = uniqueSorted(standings, "class_name");

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Leaderboard</h1>

      <EventPicker events={events} selectedId={selectedEventId} />

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}

      {!errorMsg && (
        <StandingsTable
          standings={standings}
          courses={courses}
          classes={classes}
          initialCourse={params.course ?? ""}
          initialClass={params.class ?? ""}
          initialScope={selectedScope}
          eventId={selectedEventId}
        />
      )}
    </main>
  );
}