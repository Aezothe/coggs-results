"use client";

import { useCallback, useMemo, useState } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { RegistrationRow } from "./page";

type SortKey = "name" | "course" | "class_name";

function displayName(r: RegistrationRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed";
}

function lastFirstSortKey(r: RegistrationRow): string {
  return `${(r.last_name ?? "").toLowerCase()} ${(r.first_name ?? "").toLowerCase()}`.trim();
}

export function RegistrationsList({
  registrations,
}: {
  registrations: RegistrationRow[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) =>
      displayName(r).toLowerCase().includes(q),
    );
  }, [registrations, query]);

  const getValue = useCallback((row: RegistrationRow, key: SortKey) => {
    switch (key) {
      case "name":
        return lastFirstSortKey(row);
      case "course":
        return (row.course ?? "").toLowerCase();
      case "class_name":
        return (row.class_name ?? "").toLowerCase();
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<RegistrationRow, SortKey>(
    filtered,
    getValue,
    { key: "course", dir: "asc" },
  );

  if (registrations.length === 0) {
    return (
      <p className="text-sm text-surface-muted">
        No registrations yet for this event.
      </p>
    );
  }

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
          {filtered.length} of {registrations.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-surface-muted text-sm">No matches.</p>
      ) : (
        <div className="overflow-x-auto text-surface-foreground">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-emphasis">
              <tr>
                <SortableHeader<SortKey>
                  label="Name"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Course"
                  sortKey="course"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Class"
                  sortKey="class_name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2">{displayName(r)}</td>
                  <td className="px-3 py-2 text-surface-muted">
                    {r.course ?? ""}
                  </td>
                  <td className="px-3 py-2 text-surface-muted">
                    {r.class_name ?? ""}
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