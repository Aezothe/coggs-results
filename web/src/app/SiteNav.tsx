import Link from "next/link";

export function SiteNav() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6 text-sm">
        <Link href="/" className="font-semibold text-gray-900">
          COGGS Results
        </Link>
        <div className="flex items-center gap-4 text-gray-600">
          <Link href="/leaderboard" className="hover:text-gray-900">
            Leaderboard
          </Link>
          <Link href="/people" className="hover:text-gray-900">
            People
          </Link>
        </div>
      </div>
    </nav>
  );
}