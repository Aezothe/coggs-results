import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";
import { StandingsTable } from "./StandingsTable";
import { TagPill } from "@/components/TagPill";

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
  stage_position_course: number | null;
  finishers_course: number | null;
  stage_position_class: number | null;
  finishers_class: number | null;
};

export type SplitTime = {
  entry_id: string;
  split_segment_id: string;
  split_name: string;
  split_ordinal: number;
  parent_segment_id: string;
  parent_stage_id: string;
  parent_stage_ordinal: number;
  time_ms: number | null;
  split_position_course: number | null;
  split_finishers_course: number | null;
  split_position_class: number | null;
  split_finishers_class: number | null;
};

type TagRow = {
  id: string;
  name: string;
  category: string;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
  event_type: string | null;
};

async function fetchEvent(eventId: string): Promise<EventRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event")
    .select("id, name, event_date, event_type")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EventRow | null) ?? null;
}

async function fetchEventTags(eventId: string): Promise<TagRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event_tag")
    .select("tag:tag_id(id, name, category)")
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);

  type JoinRow = { tag: TagRow | null };
  return ((data ?? []) as unknown as JoinRow[])
    .map((r) => r.tag)
    .filter((t): t is TagRow => !!t)
    .sort((a, b) => {
      if (a.category !== b.category)
        return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
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
      .in("scope_type", ["overall", "class"])
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
    .select(
      "entry_id, stage_id, stage_name, ordinal, time_ms, stage_position_course, finishers_course, stage_position_class, finishers_class",
    )
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return (data ?? []) as StageTime[];
}

async function fetchSplitTimes(eventId: string): Promise<SplitTime[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event_split_times")
    .select(
      "entry_id, split_segment_id, split_name, split_ordinal, parent_segment_id, parent_stage_id, parent_stage_ordinal, time_ms, split_position_course, split_finishers_course, split_position_class, split_finishers_class",
    )
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SplitTime[];
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
    splits?: string;
    stages?: string;
    riders?: string;
    compare?: string;
  }>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;

  const event = await fetchEvent(eventId);
  if (!event) notFound();

  let standings: StandingsRow[] = [];
  let stageTimes: StageTime[] = [];
  let splitTimes: SplitTime[] = [];
  let eventTags: TagRow[] = [];
  let errorMsg: string | null = null;

  try {
    standings = await fetchStandings(eventId);
    stageTimes = await fetchStageTimes(eventId);
    splitTimes = await fetchSplitTimes(eventId);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  try {
    eventTags = await fetchEventTags(eventId);
  } catch {
    eventTags = [];
  }

  const courses = uniqueSorted(standings, "course_name");
  const initialCourse =
    sp.course && courses.includes(sp.course) ? sp.course : (courses[0] ?? "");

  const classes = uniqueSorted(
    standings.filter((r) => r.course_name === initialCourse),
    "class_name",
  );
  const initialClass =
    sp.class && classes.includes(sp.class) ? sp.class : "";

  const initialShowSplits = sp.splits === "1";
  const initialSelectedStageIds =
    sp.stages && sp.stages.length > 0
      ? sp.stages.split(",").filter(Boolean)
      : [];
  const initialSelectedRiderIds =
    sp.riders && sp.riders.length > 0
      ? sp.riders.split(",").filter(Boolean)
      : [];
  const initialCompareOnly = sp.compare === "1";

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <nav className="mb-2 text-sm">
        <Link href="/events" className="text-page-foreground hover:underline">
          ← All events
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        {event.name}
      </h1>

      {(event.event_type || eventTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {event.event_type && (
            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded font-medium bg-surface-emphasis text-surface-foreground">
              {event.event_type}
            </span>
          )}
          {eventTags.map((t) => (
            <TagPill
              key={t.id}
              id={t.id}
              name={t.name}
              category={t.category}
            />
          ))}
        </div>
      )}

      <p className="text-sm mb-6 text-page-muted">{event.event_date ?? ""}</p>

      {errorMsg && <p className="mb-4 text-danger">Error: {errorMsg}</p>}

      {!errorMsg && (
        <div className="rounded-lg p-4 border bg-surface border-surface-border">
          <StandingsTable
            standings={standings}
            stageTimes={stageTimes}
            splitTimes={splitTimes}
            courses={courses}
            classes={classes}
            initialCourse={initialCourse}
            initialClass={initialClass}
            initialShowSplits={initialShowSplits}
            initialSelectedStageIds={initialSelectedStageIds}
            initialSelectedRiderIds={initialSelectedRiderIds}
            initialCompareOnly={initialCompareOnly}
            eventId={eventId}
          />
        </div>
      )}
    </main>
  );
}