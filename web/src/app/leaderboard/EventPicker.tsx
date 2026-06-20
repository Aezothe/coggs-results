"use client";

import { useRouter } from "next/navigation";

type EventOption = {
  id: string;
  name: string;
  event_date: string | null;
};

export function EventPicker({
  events,
  selectedId,
}: {
  events: EventOption[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 mb-4">
      <span className="text-sm text-gray-600">Event:</span>
      <select
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(`/leaderboard?event=${id}`);
        }}
        className="border border-gray-300 rounded px-2 py-1 text-sm"
      >
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.event_date ? `${ev.event_date} — ` : ""}
            {ev.name}
          </option>
        ))}
      </select>
    </label>
  );
}