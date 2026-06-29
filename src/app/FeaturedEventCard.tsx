import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/server";

type FeaturedEvent = {
  id: string;
  name: string;
  event_date: string;
  locations: string[];
};

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

function isPastOrToday(iso: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return iso <= today;
}

async function fetchFeaturedEvent(): Promise<FeaturedEvent | null> {
  const supabase = getServiceClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: pastData } = await supabase
    .from("event")
    .select("id, name, event_date")
    .lte("event_date", today)
    .order("event_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: futureData } = await supabase
    .from("event")
    .select("id, name, event_date")
    .gt("event_date", today)
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Decide which to feature based on which is closer to today.
  // Ties go to the past event (results are concrete).
  let featured: { id: string; name: string; event_date: string } | null = null;

  if (pastData && futureData) {
    const todayMs = Date.parse(today);
    const pastDistance = Math.abs(Date.parse(pastData.event_date!) - todayMs);
    const futureDistance = Math.abs(
      Date.parse(futureData.event_date!) - todayMs,
    );
    featured =
      pastDistance <= futureDistance
        ? (pastData as { id: string; name: string; event_date: string })
        : (futureData as { id: string; name: string; event_date: string });
  } else if (pastData) {
    featured = pastData as { id: string; name: string; event_date: string };
  } else if (futureData) {
    featured = futureData as { id: string; name: string; event_date: string };
  }

  if (!featured) return null;

  const { data: segData } = await supabase
    .from("segment")
    .select("stage:stage_id(location:location_id(name))")
    .eq("event_id", featured.id)
    .eq("kind", "stage");

  type SegRow = {
    stage: { location: { name: string } | null } | null;
  };

  const locations = new Set<string>();
  for (const row of (segData ?? []) as unknown as SegRow[]) {
    const name = row.stage?.location?.name;
    if (name) locations.add(name);
  }

  return {
    id: featured.id,
    name: featured.name,
    event_date: featured.event_date,
    locations: Array.from(locations).sort((a, b) => a.localeCompare(b)),
  };
}

export async function FeaturedEventCard() {
  const featured = await fetchFeaturedEvent();
  if (!featured) return null;

  const kickerText = isPastOrToday(featured.event_date)
    ? "Latest Event"
    : "Next Event";

  return (
    <div className="mb-8 surface-dark rounded-lg p-5 border bg-surface border-surface-border">
      <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-accent-1">
        {kickerText}
      </div>
      <Link href={`/leaderboard/${featured.id}`} className="block">
        <h2 className="text-xl font-bold text-surface-foreground hover:underline">
          {featured.name}
        </h2>
      </Link>
      <p className="text-sm mt-1 text-surface-muted">
        {formatLongDate(featured.event_date)}
      </p>
      {featured.locations.length > 0 && (
        <p className="text-sm mt-1 text-surface-muted">
          {featured.locations.join(" · ")}
        </p>
      )}
    </div>
  );
}