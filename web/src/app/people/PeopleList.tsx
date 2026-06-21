"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PersonRow } from "./page";

function displayName(p: PersonRow): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
}

export function PeopleList({ people }: { people: PersonRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => displayName(p).toLowerCase().includes(q));
  }, [people, query]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          autoFocus
        />
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {filtered.length} of {people.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No people match.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {filtered.map((p) => (
            <li key={p.id}>
                <Link href={`/person/${p.id}`}
                className="flex items-center justify-between py-2 hover:bg-gray-50 px-2 -mx-2 rounded"
                >
                <span>{displayName(p)}</span>
                <span className="text-sm text-gray-500 tabular-nums">
                  {p.event_count} event{p.event_count === 1 ? "" : "s"}
                </span>

              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}