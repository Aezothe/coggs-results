"use client";

import Link from "next/link";
import { useCallback } from "react";
import { formatTime } from "@/lib/format";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { PersonResult } from "./page";

type SortKey =
  | "event_date"
  | "event_name"
  | "course_name"
  | "class_name"
  | "position"
  | "total_time_ms"
  | "percentile";

export function PersonResultsTable({ results }: { results: PersonResult[] }) {
  const getValue = useCallback((row: PersonResult, key: SortKey) => {
    switch (key) {
      case "event_date":
        return row.event_date ?? null;
      case "event_name":
        return row.event_name ?? null;
      case "course_name":
        return row.course_name ?? null;
      case "class_name":
        return row.class_name ?? null;
      case "position":
        return row.is_dnf ? null : (row.position ?? null);
      case "total_time_ms":
        return row.is_dnf ? null : (row.total_time_ms ?? null);
      case "percentile":
        return row.is_dnf ? null : (row.percentile ?? null);
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<PersonResult, SortKey>(
    results,
    getValue,
    { key: "event_date", dir: "desc" },
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 sticky top-0">
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
              label="Course"
              sortKey="course_name"
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
            <SortableHeader<SortKey>
              label="Position"
              sortKey="position"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
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
            <tr
              key={r.entry_id}
              className="border-t border-gray-200 hover:bg-gray-50"
            >
              <td className="px-3 py-2 text-gray-600">{r.event_date ?? ""}</td>
              <td className="px-3 py-2">
                <Link href={`/leaderboard/${r.event_id}`}>
                  {r.event_name ?? ""}
                </Link>
              </td>
              <td className="px-3 py-2">{r.course_name ?? ""}</td>
              <td className="px-3 py-2">{r.class_name ?? ""}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.is_dnf ? "—" : (r.position ?? "")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.is_dnf ? "DNF" : formatTime(r.total_time_ms)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
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