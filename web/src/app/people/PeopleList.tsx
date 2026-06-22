"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { PersonRow } from "./page";

function displayName(p: PersonRow): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
}

type SortKey = "name" | "event_count";

export function PeopleList({ people }: { people: PersonRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => displayName(p).toLowerCase().includes(q));
  }, [people, query]);

  const getValue = useCallback((row: PersonRow, key: SortKey) => {
    switch (key) {
      case "name":
        return displayName(row).toLowerCase();
      case "event_count":
        return row.event_count;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<PersonRow, SortKey>(
    filtered,
    getValue,
    { key: "event_count", dir: "desc" },
  );

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
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <SortableHeader<SortKey>
                  label="Name"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Events"
                  sortKey="event_count"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href ={`/person/${p.id}`}>
                      {displayName(p)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {p.event_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}