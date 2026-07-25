"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { EventRow } from "./page";

type SortKey = "name" | "event_date";

export function EventsList({ events }: { events: EventRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => e.name.toLowerCase().includes(q));
  }, [events, query]);

  const getValue = useCallback((row: EventRow, key: SortKey) => {
    switch (key) {
      case "name":
        return row.name.toLowerCase();
      case "event_date":
        return row.event_date ?? "";
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<EventRow, SortKey>(
    filtered,
    getValue,
    { key: "event_date", dir: "desc" },
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-surface-border-strong rounded px-3 py-2 text-sm bg-surface text-surface-foreground placeholder:text-surface-muted"
          autoFocus
        />
        <span className="text-sm text-surface-muted whitespace-nowrap">
          {filtered.length} of {events.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-surface-muted text-sm">No events match.</p>
      ) : (
        <div className="overflow-x-auto text-surface-foreground">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-emphasis">
              <tr>
                <SortableHeader<SortKey>
                  label="Event"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Date"
                  sortKey="event_date"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {sorted.map((e) => (
                <tr key={e.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2">
                    <Link href={`/leaderboard/${e.id}`}>
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-surface-muted whitespace-nowrap">
                    {e.event_date ?? ""}
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