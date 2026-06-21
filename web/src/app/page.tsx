import Link from "next/link";

export default function HomePage() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">COGGS Results</h1>
      <p className="text-gray-600 mb-8">
        Race results and standings for COGGS events.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/leaderboard"
          className="block border border-gray-200 rounded-lg p-5 hover:bg-gray-50 transition"
        >
          <h2 className="text-lg font-medium mb-1">Leaderboard →</h2>
          <p className="text-sm text-gray-600">
            Standings for any event, filtered by course or class.
          </p>
        </Link>

        <Link href="/people"
          className="block border border-gray-200 rounded-lg p-5 hover:bg-gray-50 transition"
        >
          <h2 className="text-lg font-medium mb-1">People →</h2>
          <p className="text-sm text-gray-600">
            Search competitors and view their results over time.
          </p>
        </Link>

        <Link href="/events"
          className="block border border-gray-200 rounded-lg p-5 hover:bg-gray-50 transition"
        >
          <h2 className="text-lg font-medium mb-1">Events →</h2>
          <p className="text-sm text-gray-600">
            Search COGGS timed events
          </p>
        </Link>
      </div>
    </main>
  );
}