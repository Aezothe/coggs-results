import { getServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

// Always fetch fresh on each request. We'll add caching later.
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
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Events</h1>
        <p className="text-red-600">Error loading events: {error.message}</p>
      </main>
    );
  }

  const events = (data ?? []) as EventRow[];

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Events</h1>
      {events.length === 0 ? (
        <p className="text-gray-500">No events found.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/leaderboard/${e.id}`}
                className="flex justify-between items-center py-3 px-2 -mx-2 hover:bg-gray-50 rounded"
              >
                <span className="text-gray-900">{e.name}</span>
                <span className="text-gray-500 text-sm">{e.event_date ?? ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}