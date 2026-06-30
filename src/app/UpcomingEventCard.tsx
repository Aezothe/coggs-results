import Link from "next/link";
import type { UpcomingEvent } from "./FeaturedEventCard";

function formatLongDate(iso: string): string {
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

export function UpcomingEventCard({ event }: { event: UpcomingEvent }) {
  return (
    <Link
      href={`/events/${event.id}/registrations`}
      className="block rounded-lg p-5 border bg-surface border-surface-border hover:bg-surface-hover transition-colors"
    >
      <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-accent-1">
        Next Event
      </div>
      <h2 className="text-xl font-bold text-surface-foreground">
        {event.name}
      </h2>
      <p className="text-sm mt-1 text-surface-muted">
        {formatLongDate(event.event_date)}
      </p>
      {event.locations.length > 0 && (
        <p className="text-sm mt-1 text-surface-muted">
          {event.locations.join(" · ")}
        </p>
      )}
      <p className="text-sm mt-2 text-surface-muted">
        {event.attendee_count} registered
      </p>
    </Link>
  );
}