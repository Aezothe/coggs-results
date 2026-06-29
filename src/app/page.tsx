import Link from "next/link";
import { FeaturedEventCard } from "./FeaturedEventCard";

export const dynamic = "force-dynamic";

type CardLink = {
  href: string;
  title: string;
  description: string;
};

const cards: CardLink[] = [
  {
    href: "/events",
    title: "Events →",
    description: "Search events timed by COGGS.",
  },
  {
    href: "/people",
    title: "People →",
    description: "Search competitors and view their results over time.",
  },
  {
    href: "/stages",
    title: "Stages →",
    description: "Search stages used in COGGS events.",
  },
  {
    href: "/terrain",
    title: "Terrain →",
    description: "See what sorts of terrain gets ridden at COGGS events",
  },
];

export default async function HomePage() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2 text-page-foreground">
        COGGS Results
      </h1>
      <p className="text-page-muted mb-8">
        Race results and standings for COGGS events.
      </p>

      <FeaturedEventCard />

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link href={card.href}
            className="block rounded-lg p-5 border bg-surface border-surface-border hover:bg-surface-hover transition-colors"
          >
            <h2 className="text-lg font-medium mb-1 text-surface-foreground">
              {card.title}
            </h2>
            <p className="text-sm text-surface-muted">{card.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}