"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";

export type EventSummary = {
  event_id: string;
  event_name: string;
  event_date: string | null;
  courses: string[];
  riders: number;
};

type SortKey = "event_date" | "event_name" | "courses" | "riders";

export function EventHistoryTable({ events }: { events: EventSummary[] }) {
  const getValue = useCallback((row: EventSummary, key: SortKey) => {
    switch (key) {
      case "event_date":
        return row.event_date ?? null;
      case "event_name":
        return row.event_name.toLowerCase();
      case "courses":
        return row.courses.join(", ").toLowerCase();
      case "riders":
        return row.riders;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<EventSummary, SortKey>(
    events,
    getValue,
    { key: "event_date", dir: "desc" },
  );

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
              label="Courses"
              sortKey="courses"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
            />
            <SortableHeader<SortKey>
              label="Riders"
              sortKey="riders"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((ev) => (
            <tr key={ev.event_id} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-600">
                {ev.event_date ?? ""}
              </td>
              <td className="px-3 py-2">
                <Link href={`/leaderboard/${ev.event_id}`}>
                  {ev.event_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-600">
                {ev.courses.join(", ")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {ev.riders}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}