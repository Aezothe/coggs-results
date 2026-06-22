import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";
import { TopPerformersTable, type TopPerformer } from "./TopPerformersTable";
import { EventHistoryTable, type EventSummary } from "./EventHistoryTable";

export const dynamic = "force-dynamic";

type StageRow = {
  id: string;
  name: string;
};

type RideRow = {
  event_id: string;
  entry_id: string;
  person_id: string | null;
  competitor_id: string;
  time_ms: number | null;
  stage_position: number | null;
  finishers_on_stage: number | null;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
};

type EntryRow = {
  id: string;
  course_id: string | null;
};

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type CompetitorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  person_id: string | null;
};

type CourseRow = {
  id: string;
  name: string;
};

async function fetchStage(stageId: string): Promise<StageRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("stage")
    .select("id, name")
    .eq("id", stageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StageRow | null) ?? null;
}

async function fetchRides(stageId: string): Promise<RideRow[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const all: RideRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("event_stage_times")
      .select(
        "event_id, entry_id, person_id, competitor_id, time_ms, stage_position, finishers_on_stage",
      )
      .eq("stage_id", stageId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as RideRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function percentile(position: number, finishers: number): number {
  if (finishers < 2) return 1.0;
  return (finishers - position) / (finishers - 1);
}

async function fetchPeopleAndCompetitors(rides: RideRow[]) {
  const supabase = getServiceClient();

  const personIds = Array.from(
    new Set(rides.map((r) => r.person_id).filter((x): x is string => !!x)),
  );
  const competitorIds = Array.from(
    new Set(rides.map((r) => r.competitor_id).filter(Boolean)),
  );

  const peopleById = new Map<string, PersonRow>();
  const competitorsById = new Map<string, CompetitorRow>();

  if (personIds.length > 0) {
    const { data, error } = await supabase
      .from("person")
      .select("id, first_name, last_name")
      .in("id", personIds);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as PersonRow[]) {
      peopleById.set(p.id, p);
    }
  }

  if (competitorIds.length > 0) {
    // chunk to keep .in() under typical limits
    const chunkSize = 500;
    for (let i = 0; i < competitorIds.length; i += chunkSize) {
      const chunk = competitorIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("competitor")
        .select("id, first_name, last_name, person_id")
        .in("id", chunk);
      if (error) throw new Error(error.message);
      for (const c of (data ?? []) as CompetitorRow[]) {
        competitorsById.set(c.id, c);
      }
    }
  }

  return { peopleById, competitorsById };
}

async function fetchEventsAndCourses(rides: RideRow[]) {
  const supabase = getServiceClient();

  const eventIds = Array.from(new Set(rides.map((r) => r.event_id)));
  const entryIds = Array.from(new Set(rides.map((r) => r.entry_id)));

  const eventsById = new Map<string, EventRow>();
  if (eventIds.length > 0) {
    const { data, error } = await supabase
      .from("event")
      .select("id, name, event_date")
      .in("id", eventIds);
    if (error) throw new Error(error.message);
    for (const e of (data ?? []) as EventRow[]) {
      eventsById.set(e.id, e);
    }
  }

  // entry -> course_id, so we can attribute courses to events for this stage
  const entriesById = new Map<string, EntryRow>();
  if (entryIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < entryIds.length; i += chunkSize) {
      const chunk = entryIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("entry")
        .select("id, course_id")
        .in("id", chunk);
      if (error) throw new Error(error.message);
      for (const en of (data ?? []) as EntryRow[]) {
        entriesById.set(en.id, en);
      }
    }
  }

  const courseIds = Array.from(
    new Set(
      Array.from(entriesById.values())
        .map((en) => en.course_id)
        .filter((x): x is string => !!x),
    ),
  );

  const coursesById = new Map<string, CourseRow>();
  if (courseIds.length > 0) {
    const { data, error } = await supabase
      .from("course")
      .select("id, name")
      .in("id", courseIds);
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as CourseRow[]) {
      coursesById.set(c.id, c);
    }
  }

  return { eventsById, entriesById, coursesById };
}

function buildTopPerformers(
  rides: RideRow[],
  peopleById: Map<string, PersonRow>,
  competitorsById: Map<string, CompetitorRow>,
): TopPerformer[] {
  // Group by person_id when available; fall back to competitor_id.
  const byIdentity = new Map<
    string,
    {
      personId: string | null;
      displayName: string;
      pcts: number[];
    }
  >();

  for (const r of rides) {
    if (r.time_ms == null) continue;
    if (r.stage_position == null || r.finishers_on_stage == null) continue;

    const identityKey = r.person_id ?? `c:${r.competitor_id}`;
    const personId = r.person_id;

    let displayName = "Unnamed";
    if (personId) {
      const p = peopleById.get(personId);
      if (p) {
        displayName =
          [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
      }
    } else {
      const c = competitorsById.get(r.competitor_id);
      if (c) {
        displayName =
          [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
      }
    }

    if (!byIdentity.has(identityKey)) {
      byIdentity.set(identityKey, { personId, displayName, pcts: [] });
    }
    byIdentity
      .get(identityKey)!
      .pcts.push(percentile(r.stage_position, r.finishers_on_stage));
  }

  const out: TopPerformer[] = [];
  for (const [identityKey, v] of byIdentity.entries()) {
    if (v.pcts.length === 0) continue;
    out.push({
      identityKey,
      personId: v.personId,
      displayName: v.displayName,
      best: Math.max(...v.pcts),
      avg: v.pcts.reduce((a, b) => a + b, 0) / v.pcts.length,
      rides: v.pcts.length,
    });
  }

  out.sort((a, b) => {
    if (b.best !== a.best) return b.best - a.best;
    return b.rides - a.rides;
  });

  return out;
}

function buildEventSummaries(
  rides: RideRow[],
  eventsById: Map<string, EventRow>,
  entriesById: Map<string, EntryRow>,
  coursesById: Map<string, CourseRow>,
): EventSummary[] {
  const byEvent = new Map<
    string,
    { event_id: string; entry_ids: Set<string>; courses: Set<string> }
  >();

  for (const r of rides) {
    if (!byEvent.has(r.event_id)) {
      byEvent.set(r.event_id, {
        event_id: r.event_id,
        entry_ids: new Set(),
        courses: new Set(),
      });
    }
    const slot = byEvent.get(r.event_id)!;
    slot.entry_ids.add(r.entry_id);

    const entry = entriesById.get(r.entry_id);
    if (entry?.course_id) {
      const course = coursesById.get(entry.course_id);
      if (course?.name) slot.courses.add(course.name);
    }
  }

  const out: EventSummary[] = [];
  for (const slot of byEvent.values()) {
    const ev = eventsById.get(slot.event_id);
    out.push({
      event_id: slot.event_id,
      event_name: ev?.name ?? "Unknown event",
      event_date: ev?.event_date ?? null,
      courses: Array.from(slot.courses).sort((a, b) => a.localeCompare(b)),
      riders: slot.entry_ids.size,
    });
  }

  out.sort((a, b) => {
    const ad = a.event_date ?? "";
    const bd = b.event_date ?? "";
    return bd.localeCompare(ad);
  });

  return out;
}

export default async function StagePage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;

  const stage = await fetchStage(stageId);
  if (!stage) notFound();

  let rides: RideRow[] = [];
  let errorMsg: string | null = null;
  try {
    rides = await fetchRides(stageId);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  let performers: TopPerformer[] = [];
  let events: EventSummary[] = [];

  if (!errorMsg && rides.length > 0) {
    const { peopleById, competitorsById } =
      await fetchPeopleAndCompetitors(rides);
    const { eventsById, entriesById, coursesById } =
      await fetchEventsAndCourses(rides);
    performers = buildTopPerformers(rides, peopleById, competitorsById);
    events = buildEventSummaries(rides, eventsById, entriesById, coursesById);
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <nav className="mb-2 text-sm">
        <Link href="/stages" className="text-gray-900 hover:underline">
          ← All stages
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold mb-1">{stage.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {events.length} event{events.length === 1 ? "" : "s"} ·{" "}
        {performers.length} rider{performers.length === 1 ? "" : "s"}
      </p>

      {errorMsg && <p className="text-red-600 mb-4">Error: {errorMsg}</p>}

      {!errorMsg && performers.length === 0 && (
        <p className="text-gray-500">No riders have raced this stage yet.</p>
      )}

      {performers.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-medium mb-3">Top performers</h2>
          <div className="overflow-x-auto">
            <TopPerformersTable performers={performers} />
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Event history</h2>
          <div className="overflow-x-auto">
            <EventHistoryTable events={events} />
          </div>
        </section>
      )}
    </main>
  );
}