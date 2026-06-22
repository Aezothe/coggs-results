import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";
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
  finishers_in_scope: number | null;
};

export type StageTime = {
  entry_id: string;
  stage_id: string;
  stage_name: string;
  ordinal: number;
  time_ms: number | null;
  stage_position: number | null;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
};

async function fetchEvent(eventId: string): Promise<EventRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event")
    .select("id, name, event_date")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as EventRow | null) ?? null;
}

async function fetchStandings(eventId: string): Promise<StandingsRow[]> {
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
      .in("scope_type", ["overall", "class"]) // age can be added back later when you add age UI
      .order("course_name", { ascending: true })
      .order("scope_type", { ascending: true })
      .order("position", { ascending: true, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...(data as StandingsRow[]));

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

async function fetchStageTimes(eventId: string): Promise<StageTime[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("event_stage_times")
    .select("entry_id, stage_id, stage_name, ordinal, time_ms, stage_position")
    .eq("event_id", eventId);

  if (error) throw new Error(error.message);
  return (data ?? []) as StageTime[];
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
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    course?: string;
    class?: string;
  }>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;

  const event = await fetchEvent(eventId);
  if (!event) notFound();

  let standings: StandingsRow[] = [];
  let stageTimes: StageTime[] = [];
  let errorMsg: string | null = null;

  try {
    standings = await fetchStandings(eventId);
    stageTimes = await fetchStageTimes(eventId);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const courses = uniqueSorted(standings, "course_name");

  // Course is now REQUIRED: pick querystring if valid, otherwise first available.
  const initialCourse =
    sp.course && courses.includes(sp.course) ? sp.course : (courses[0] ?? "");

  // Class options should come from the selected course only.
  const classes = uniqueSorted(
    standings.filter((r) => r.course_name === initialCourse),
    "class_name",
  );

  const initialClass =
    sp.class && classes.includes(sp.class) ? sp.class : "";

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <nav className="mb-2 text-sm">
        <Link href="/events" className="text-blue-600 hover:underline">
          ← All events
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold mb-1">{event.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{event.event_date ?? ""}</p>

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}

      {!errorMsg && (
        <StandingsTable
          standings={standings}
          stageTimes={stageTimes}
          courses={courses}
          classes={classes}
          initialCourse={initialCourse}
          initialClass={initialClass}
          eventId={eventId}
        />
      )}
    </main>
  );
}