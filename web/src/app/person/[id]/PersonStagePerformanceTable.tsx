"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import { TagPill } from "@/components/TagPill";
import type { StageSummary } from "./PersonStagePerformance";

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
    <div className="overflow-x-auto text-text-on-light">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-strong">
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
        <tbody className="divide-y divide-on-light">
          {sorted.map((s) => (
            <tr key={s.stage_id} className="hover:bg-surface-muted">
              <td className="px-3 py-2 align-top">
                <Link
                  href={`/stages/${s.stage_id}`}
                  className="text-text-on-light hover:underline"
                >
                  {s.stage_name}
                </Link>
                {s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.tags.map((t) => (
                      <TagPill key={t.id} id={t.id} name={t.name} />
                    ))}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums align-top text-text-on-light">
                {(s.best_percentile * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-on-light-muted align-top">
                {(s.avg_percentile * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-on-light-muted align-top">
                {s.rides}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}