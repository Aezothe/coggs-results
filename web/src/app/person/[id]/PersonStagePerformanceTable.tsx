"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";

type StageSummary = {
  stage_id: string;
  stage_name: string;
  best_percentile: number;
  avg_percentile: number;
  rides: number;
};

type SortKey = "stage_name" | "best_percentile" | "avg_percentile" | "rides";

export function PersonStagePerformanceTable({
  summaries,
}: {
  summaries: StageSummary[];
}) {
  const getValue = useCallback((row: StageSummary, key: SortKey) => {
    switch (key) {
      case "stage_name":
        return row.stage_name;
      case "best_percentile":
        return row.best_percentile;
      case "avg_percentile":
        return row.avg_percentile;
      case "rides":
        return row.rides;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<StageSummary, SortKey>(
    summaries,
    getValue,
    { key: "best_percentile", dir: "desc" },
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <SortableHeader<SortKey>
              label="Stage"
              sortKey="stage_name"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
            />
            <SortableHeader<SortKey>
              label="Best"
              sortKey="best_percentile"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
            />
            <SortableHeader<SortKey>
              label="Average"
              sortKey="avg_percentile"
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
            <tr key={s.stage_id} className="hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link href = {`/stages/${s.stage_id}`} >
                  {s.stage_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {(s.best_percentile * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {(s.avg_percentile * 100).toFixed(1)}%
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