"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";

export type StageWithCounts = {
  id: string;
  name: string;
  events: number;
  rides: number;
};

type SortKey = "name" | "events" | "rides";

export function TerrainStagesTable({ stages }: { stages: StageWithCounts[] }) {
  const getValue = useCallback((row: StageWithCounts, key: SortKey) => {
    switch (key) {
      case "name":
        return row.name.toLowerCase();
      case "events":
        return row.events;
      case "rides":
        return row.rides;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<StageWithCounts, SortKey>(
    stages,
    getValue,
    { key: "rides", dir: "desc" },
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <SortableHeader<SortKey>
              label="Stage"
              sortKey="name"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
            />
            <SortableHeader<SortKey>
              label="Events"
              sortKey="events"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
            />
            <SortableHeader<SortKey>
              label="Rides"
              sortKey="rides"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link href={`/stages/${s.id}`}
                  className="text-gray-900 hover:underline"
                >
                  {s.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {s.events}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {s.rides}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}