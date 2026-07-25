import { getServiceClient } from "@/lib/supabase/server";
import { EventsList } from "./EventsList";

export const dynamic = "force-dynamic";

export type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
};

export default async function EventsPage() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event")
    .select("id, name, event_date")
    .order("event_date", { ascending: false });

  if (error) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4 text-page-foreground">
          Events
        </h1>
        <p className="text-danger">Error loading events: {error.message}</p>
      </main>
    );
  }

  const events = (data ?? []) as EventRow[];

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1 text-page-foreground">
        Events
      </h1>
      <p className="text-sm text-page-muted mb-6">
        {events.length} event{events.length === 1 ? "" : "s"}
      </p>

      {events.length === 0 ? (
        <p className="text-page-muted">No events found.</p>
      ) : (
        <div className="rounded-lg p-4 border bg-surface border-surface-border">
          <EventsList events={events} />
        </div>
      )}
    </main>
  );
}