import { getServiceClient } from "@/lib/supabase/server";

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
            <li key={e.id} className="py-3 flex justify-between">
              <span>{e.name}</span>
              <span className="text-gray-500">{e.event_date ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}