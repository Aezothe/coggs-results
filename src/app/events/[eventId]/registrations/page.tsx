import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";
import { RegistrationsList } from "./RegistrationsList";

export const dynamic = "force-dynamic";

export type RegistrationRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  course: string | null;
  class_name: string | null;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
  event_type: string | null;
  neon_event_id: string | null;
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
    .select("id, name, event_date, event_type, neon_event_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EventRow | null) ?? null;
}

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

async function fetchRegistrations(
  neonEventId: string | null,
): Promise<RegistrationRow[]> {
  if (!neonEventId) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event_attendees")
    .select("id, first_name, last_name, course, class_name")
    .eq("neon_event_id", neonEventId)
    .eq("registration_status", "SUCCEEDED");
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistrationRow[];
}

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const event = await fetchEvent(eventId);
  if (!event) notFound();

  const [locations, registrations] = await Promise.all([
    fetchLocations(eventId),
    fetchRegistrations(event.neon_event_id),
  ]);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-accent-1">
            Registrations
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

      <div className="mb-4">
        <Link
          href={`/leaderboard/${event.id}`}
          className="text-sm text-accent-1 hover:underline"
        >
          View leaderboard →
        </Link>
      </div>

      <div className="rounded-lg p-4 border bg-surface border-surface-border">
        <RegistrationsList registrations={registrations} />
      </div>
    </main>
  );
}