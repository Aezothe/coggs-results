"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { StageRow } from "./page";

type SortKey = "name" | "location_name" | "event_appearances";

const NO_LOCATION_LABEL = "Other";

export function StagesList({ stages }: { stages: StageRow[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");

  // All distinct locations actually in use, alphabetical.
  // Stages without a location bucket under "Other".
  const locations = useMemo(() => {
    const set = new Set<string>();
    let hasOther = false;
    for (const s of stages) {
      if (s.location_name) {
        set.add(s.location_name);
      } else {
        hasOther = true;
      }
    }
    const named = Array.from(set).sort((a, b) => a.localeCompare(b));
    return hasOther ? [...named, NO_LOCATION_LABEL] : named;
  }, [stages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stages.filter((s) => {
      if (location) {
        if (location === NO_LOCATION_LABEL) {
          if (s.location_name) return false;
        } else if (s.location_name !== location) {
          return false;
        }
      }
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stages, query, location]);

  const getValue = useCallback((row: StageRow, key: SortKey) => {
    switch (key) {
      case "name":
        return row.name.toLowerCase();
      case "location_name":
        // Sort empty locations last regardless of direction by using a high
        // string sentinel; "~" sorts after letters in ASCII.
        return row.location_name ? row.location_name.toLowerCase() : "~";
      case "event_appearances":
        return row.event_appearances;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<StageRow, SortKey>(
    filtered,
    getValue,
    { key: "event_appearances", dir: "desc" },
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by stage name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-surface-border-strong rounded px-3 py-2 text-sm bg-surface text-surface-foreground placeholder:text-surface-muted"
          autoFocus
        />

        <label className="flex items-center gap-2 text-sm">
          <span className="text-surface-muted">Location:</span>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="border border-surface-border-strong rounded px-2 py-1 text-sm bg-surface text-surface-foreground"
          >
            <option value="">All</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>

        <span className="text-sm text-surface-muted whitespace-nowrap">
          {filtered.length} of {stages.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-surface-muted text-sm">No stages match.</p>
      ) : (
        <div className="overflow-x-auto text-surface-foreground">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-emphasis">
              <tr>
                <SortableHeader<SortKey>
                  label="Stage"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Location"
                  sortKey="location_name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Events"
                  sortKey="event_appearances"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {sorted.map((s) => (
                <tr key={s.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2">
                    <Link href={`/stages/${s.id}`}>
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-surface-muted">
                    {s.location_name ?? NO_LOCATION_LABEL}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-surface-muted">
                    {s.event_appearances}
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