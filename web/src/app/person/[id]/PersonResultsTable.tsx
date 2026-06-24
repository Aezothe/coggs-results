"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { PersonResult } from "./page";

type SortKey = "event_date" | "event_name" | "percentile";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PersonResultsTable({ results }: { results: PersonResult[] }) {
  const getValue = useCallback((row: PersonResult, key: SortKey) => {
    switch (key) {
      case "event_date":
        return row.event_date ?? null;
      case "event_name":
        return row.event_name ?? null;
      case "percentile":
        return row.is_dnf ? null : (row.percentile ?? null);
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<PersonResult, SortKey>(
    results,
    getValue,
    { key: "event_date", dir: "desc" },
  );

  if (results.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No results match the current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <SortableHeader<SortKey>
              label="Date"
              sortKey="event_date"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
            />
            <SortableHeader<SortKey>
              label="Event"
              sortKey="event_name"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
            />
            <SortableHeader<SortKey>
              label="Percentile"
              sortKey="percentile"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((r) => (
            <tr key={r.entry_id} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-600 align-top whitespace-nowrap">
                {formatDate(r.event_date)}
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-500 tabular-nums text-xs w-6 shrink-0">
                    {r.is_dnf ? "—" : (r.position ?? "")}
                  </span>
                  <div className="leading-tight">
                    <Link href={`/leaderboard/${r.event_id}`} className="text-blue-500 hover:underline">
                      {r.event_name ?? ""}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {[r.course_name, r.class_name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums align-top">
                {r.percentile != null
                  ? `${(r.percentile * 100).toFixed(1)}%`
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}