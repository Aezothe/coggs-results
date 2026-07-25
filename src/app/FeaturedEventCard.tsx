import { getServiceClient } from "@/lib/supabase/server";
import { PastEventCard } from "./PastEventCard";
import { UpcomingEventCard } from "./UpcomingEventCard";

type EventBase = {
  id: string;
  name: string;
  event_date: string;
  locations: string[];
};

export type PastEvent = EventBase;
export type UpcomingEvent = EventBase & {
  attendee_count: number;
};

async function fetchLocations(eventId: string): Promise<string[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("segment")
    .select("stage:stage_id(location:location_id(name))")
    .eq("event_id", eventId)
    .eq("kind", "stage");

  type SegRow = {
    stage: { location: { name: string } | null } | null;
  };

  const names = new Set<string>();
  for (const row of (data ?? []) as unknown as SegRow[]) {
    const name = row.stage?.location?.name;
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function hasCompletedTimes(eventId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("attempt")
    .select("id")
    .eq("event_id", eventId)
    .limit(1);
  if (!data || data.length === 0) return false;

  // Check if any of those attempts have segment_time rows
  const { data: timeCheck } = await supabase
    .from("segment_time")
    .select("attempt_id")
    .in(
      "attempt_id",
      data.map((a) => a.id),
    )
    .limit(1);
  return (timeCheck?.length ?? 0) > 0;
}

async function fetchMostRecentPastEvent(): Promise<PastEvent | null> {
  const supabase = getServiceClient();

  const today = new Date().toISOString().split("T")[0];

  // Get the most recent events by date and find one with completed times
  const { data: events } = await supabase
    .from("event")
    .select("id, name, event_date")
    .lte("event_date", today)
    .order("event_date", { ascending: false })
    .limit(20); // check the 20 most recent past events

  if (!events) return null;

  for (const ev of events) {
    if (!ev.event_date) continue;
    const has = await hasCompletedTimes(ev.id);
    if (has) {
      const locations = await fetchLocations(ev.id);
      return {
        id: ev.id,
        name: ev.name,
        event_date: ev.event_date,
        locations,
      };
    }
  }
  return null;
}

async function fetchNextUpcomingEvent(): Promise<UpcomingEvent | null> {
  const supabase = getServiceClient();

  const today = new Date().toISOString().split("T")[0];

  // Get the next 20 events by date and find the earliest without completed times
  const { data: events } = await supabase
    .from("event")
    .select("id, name, event_date, neon_event_id")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(20);

  if (!events) return null;

  for (const ev of events) {
    if (!ev.event_date) continue;
    const has = await hasCompletedTimes(ev.id);
    if (!has) {
      const locations = await fetchLocations(ev.id);

      // Count registered attendees via neon_event_id mapping
      let attendee_count = 0;
      if (ev.neon_event_id) {
        const { count } = await supabase
          .from("event_attendees")
          .select("id", { count: "exact", head: true })
          .eq("neon_event_id", ev.neon_event_id)
          .eq("registration_status", "SUCCEEDED");
        attendee_count = count ?? 0;
      }

      return {
        id: ev.id,
        name: ev.name,
        event_date: ev.event_date,
        locations,
        attendee_count,
      };
    }
  }
  return null;
}

export async function FeaturedEventCard() {
  const [pastEvent, upcomingEvent] = await Promise.all([
    fetchMostRecentPastEvent(),
    fetchNextUpcomingEvent(),
  ]);

  if (!pastEvent && !upcomingEvent) return null;

  return (
    <div className="mb-8 flex flex-col gap-4">
      {upcomingEvent && <UpcomingEventCard event={upcomingEvent} />}
      {pastEvent && <PastEventCard event={pastEvent} />}
    </div>
  );
}