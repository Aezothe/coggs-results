import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/server";
import { StandingsTable } from "./StandingsTable";
import { TagPill } from "@/components/TagPill";

// EGRESS FIX 2: was `export const dynamic = "force-dynamic"`, which forced a
// full set of Supabase queries on every single page view. With revalidate the
// rendered page is cached and re-fetched at most once per interval per URL
// variant, regardless of how many spectators are refreshing.
//
// 60s is a reasonable live-race value. For events that have finished you can
// safely raise this to 3600 (or higher) since results no longer change.
export const revalidate = 60;

export type ScopeType = "overall" | "class" | "age";

// NOTE: the types below intentionally declare only the columns the client
// actually renders. Adding a field here means also adding it to the matching
// .select() string, and vice versa — keep them in sync or the value arrives
// as undefined at runtime.
export type StandingsRow = {
  entry_id: string;
  person_id: string | null;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  class_name: string | null;
  total_time_ms: number | null;
  is_dnf: boolean;
  scope_type: ScopeType;
  position: number | null;
  time_back_ms: number | null;
};

export type StageTime = {
  entry_id: string;
  stage_id: string;
  stage_name: string;
  ordinal: number;
  time_ms: number | null;
  stage_position_course: number | null;
  stage_position_class: number | null;
};

export type SplitTime = {
  entry_id: string;
  split_segment_id: string;
  split_name: string;
  split_ordinal: number;
  parent_stage_id: string;
  counts_toward_total: boolean;
  time_ms: number | null;
  split_position_course: number | null;
  split_position_class: number | null;
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

function formatLongDate(iso: string | null): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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

async function fetchEventLocations(eventId: string): Promise<string[]> {
  const supabase = getServiceClient();
  // Pull segments for this event, joined to stage → location.
  const { data, error } = await supabase
    .from("segment")
    .select("stage:stage_id(location:location_id(name))")
    .eq("event_id", eventId)
    .eq("kind", "stage");
  if (error) throw new Error(error.message);
  type JoinRow = {
    stage: { location: { name: string } | null } | null;
  };
  const names = new Set<string>();
  for (const row of (data ?? []) as unknown as JoinRow[]) {
    const name = row.stage?.location?.name;
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function fetchStandings(eventId: string): Promise<StandingsRow[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: StandingsRow[] = [];
  let offset = 0;
  while (true) {
    // EGRESS FIX 3: dropped competitor_id, age_category, scope_value,
    // percentile, winner_time_ms, entrants_in_scope, finishers_in_scope —
    // none are referenced anywhere in StandingsTable.
    const { data, error } = await supabase
      .from("standings_scoped")
      .select(
        "entry_id, person_id, first_name, last_name, course_name, class_name, total_time_ms, is_dnf, scope_type, position, time_back_ms",
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
  const pageSize = 1000;
  const all: StageTime[] = [];
  let offset = 0;
  while (true) {
    // EGRESS FIX 3: dropped finishers_course, finishers_class (unused).
    const { data, error } = await supabase
      .from("event_stage_times")
      .select(
        "entry_id, stage_id, stage_name, ordinal, time_ms, stage_position_course, stage_position_class",
      )
      .eq("event_id", eventId)
      .order("entry_id", { ascending: true })
      .order("ordinal", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as StageTime[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function fetchSplitTimes(eventId: string): Promise<SplitTime[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: SplitTime[] = [];
  let offset = 0;
  while (true) {
    // EGRESS FIX 3: dropped parent_segment_id, parent_stage_ordinal,
    // split_finishers_course, split_finishers_class (unused). parent_segment_id
    // in particular was a 36-char UUID repeated on every one of ~3,600 rows.
    const { data, error } = await supabase
      .from("event_split_times")
      .select(
        "entry_id, split_segment_id, split_name, split_ordinal, parent_stage_id, counts_toward_total, time_ms, split_position_course, split_position_class",
      )
      .eq("event_id", eventId)
      // Deterministic order so pagination is stable across pages. Ordering by
      // entry_id keeps each rider's rows together; split_ordinal keeps columns
      // in course order.
      .order("entry_id", { ascending: true })
      .order("split_ordinal", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as SplitTime[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
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

  // Splits are hidden unless ?splits=1, so there is no reason to fetch them on
  // a default page load. This is the single biggest egress win: the split query
  // is ~3,600 rows (15 per rider) versus ~240 for stages and ~480 for
  // standings.
  //
  // Safe because onToggleSplits() in StandingsTable calls updateUrl(), which
  // does a router.replace() — that re-runs this server component with
  // splits=1, so the data arrives on demand.
  const wantSplits = sp.splits === "1";

  let standings: StandingsRow[] = [];
  let stageTimes: StageTime[] = [];
  let splitTimes: SplitTime[] = [];
  let eventTags: TagRow[] = [];
  let locations: string[] = [];
  let errorMsg: string | null = null;

  try {
    [standings, stageTimes, splitTimes, eventTags, locations] =
      await Promise.all([
        fetchStandings(eventId),
        fetchStageTimes(eventId),
        wantSplits ? fetchSplitTimes(eventId) : Promise.resolve([]),
        fetchEventTags(eventId),
        fetchEventLocations(eventId),
      ]);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const courses = uniqueSorted(standings, "course_name");
  const initialCourse =
    sp.course && courses.includes(sp.course) ? sp.course : (courses[0] ?? "");

  const classes = uniqueSorted(
    standings.filter((r) => r.course_name === initialCourse),
    "class_name",
  );
  const initialClass = sp.class && classes.includes(sp.class) ? sp.class : "";

  const initialShowSplits = wantSplits;
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
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-accent-1">
            Event Results
          </div>
          <h1 className="text-3xl font-bold text-page-foreground">
            {event.name}
          </h1>
          {locations.length > 0 && (
            <p className="text-sm mt-1 text-page-muted">
              {locations.join(" · ")}
            </p>
          )}
        </div>
        {event.event_date && (
          <p className="text-sm text-page-muted sm:text-right">
            {formatLongDate(event.event_date)}
          </p>
        )}
      </header>

      {(event.event_type || eventTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
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
