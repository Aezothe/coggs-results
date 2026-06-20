import { getServiceClient } from "@/lib/supabase/server";
import { EventPicker } from "./EventPicker";
import { StandingsTable } from "./StandingsTable";

export const dynamic = "force-dynamic";

type ResultsRow = {
  entry_id: string;
  event_id: string;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  class_name: string | null;
  total_time_ms: number | null;
  is_dnf: boolean | null;
};

export type StandingsRow = {
  entry_id: string;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  class_name: string | null;
  total_time_ms: number | null;
  is_dnf: boolean | null;
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

async function fetchAllResults(eventId: string): Promise<ResultsRow[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: ResultsRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("results")
      .select(
        "entry_id, event_id, first_name, last_name, course_name, class_name, total_time_ms, is_dnf",
      )
      .eq("event_id", eventId)
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as ResultsRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function buildStandings(rows: ResultsRow[]): StandingsRow[] {
  const byEntry = new Map<string, StandingsRow>();
  for (const r of rows) {
    if (!r.entry_id) continue;
    if (!byEntry.has(r.entry_id)) {
      byEntry.set(r.entry_id, {
        entry_id: r.entry_id,
        first_name: r.first_name,
        last_name: r.last_name,
        course_name: r.course_name,
        class_name: r.class_name,
        total_time_ms: r.total_time_ms,
        is_dnf: r.is_dnf,
      });
    }
  }
  return Array.from(byEntry.values()).sort((a, b) => {
    const ad = !!a.is_dnf;
    const bd = !!b.is_dnf;
    if (ad !== bd) return ad ? 1 : -1;
    const at = a.total_time_ms ?? Number.MAX_SAFE_INTEGER;
    const bt = b.total_time_ms ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    const al = (a.last_name ?? "").localeCompare(b.last_name ?? "");
    if (al !== 0) return al;
    return (a.first_name ?? "").localeCompare(b.first_name ?? "");
  });
}

/**
 * Get sorted unique non-empty values for a string field.
 */
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

  const selectedId =
    params.event && events.some((e) => e.id === params.event)
      ? params.event
      : events[0].id;

  let standings: StandingsRow[] = [];
  let errorMsg: string | null = null;
  try {
    const rows = await fetchAllResults(selectedId);
    standings = buildStandings(rows);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const courses = uniqueSorted(standings, "course_name");
  const classes = uniqueSorted(standings, "class_name");

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Leaderboard</h1>

      <EventPicker events={events} selectedId={selectedId} />

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}

      {!errorMsg && (
        <StandingsTable
          standings={standings}
          courses={courses}
          classes={classes}
          initialCourse={params.course ?? ""}
          initialClass={params.class ?? ""}
          eventId={selectedId}
        />
      )}
    </main>
  );
}