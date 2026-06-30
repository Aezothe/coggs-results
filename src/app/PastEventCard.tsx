import Link from "next/link";
import type { PastEvent } from "./FeaturedEventCard";

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

export function PastEventCard({ event }: { event: PastEvent }) {
  return (
    <Link
      href={`/leaderboard/${event.id}`}
      className="block rounded-lg p-5 border bg-surface border-surface-border hover:bg-surface-hover transition-colors"
    >
      <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-accent-1">
        Latest Event
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
    </Link>
  );
}