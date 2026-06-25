import { getServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type EventRow = {
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
        <div className="rounded-lg p-2 border bg-surface border-surface-border">
          <ul className="divide-y divide-surface-border">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/leaderboard/${e.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded hover:bg-surface-hover"
                >
                  <span className="text-surface-foreground">{e.name}</span>
                  <span className="text-sm text-surface-muted tabular-nums">
                    {e.event_date ?? ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}