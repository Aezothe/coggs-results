"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";

export type TopPerformer = {
  identityKey: string;
  personId: string | null;
  displayName: string;
  best: number;
  avg: number;
  rides: number;
};

type SortKey = "displayName" | "best" | "avg" | "rides";

export function TopPerformersTable({
  performers,
}: {
  performers: TopPerformer[];
}) {
  const getValue = useCallback((row: TopPerformer, key: SortKey) => {
    switch (key) {
      case "displayName":
        return row.displayName.toLowerCase();
      case "best":
        return row.best;
      case "avg":
        return row.avg;
      case "rides":
        return row.rides;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<TopPerformer, SortKey>(
    performers,
    getValue,
    { key: "best", dir: "desc" },
  );

  return (
    <div className="overflow-x-auto text-surface-foreground">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-emphasis">
          <tr>
            <th className="text-left px-3 py-2 w-12 text-surface-muted font-medium">
              #
            </th>
            <SortableHeader<SortKey>
              label="Name"
              sortKey="displayName"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
            />
            <SortableHeader<SortKey>
              label="Best"
              sortKey="best"
              currentKey={sort.key}
              currentDir={sort.dir}
              onSort={onSort}
              align="right"
            />
            <SortableHeader<SortKey>
              label="Average"
              sortKey="avg"
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
        <tbody className="divide-y divide-surface-border">
          {sorted.map((p, i) => (
            <tr key={p.identityKey} className="hover:bg-surface-hover">
              <td className="px-3 py-2 text-surface-muted tabular-nums">
                {i + 1}
              </td>
              <td className="px-3 py-2">
                {p.personId ? (
                  <Link href={`/person/${p.personId}`}
                    className="text-surface-foreground hover:underline"
                  >
                    {p.displayName}
                  </Link>
                ) : (
                  <span className="text-surface-foreground">
                    {p.displayName}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-surface-foreground">
                {(p.best * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-surface-muted">
                {(p.avg * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-surface-muted">
                {p.rides}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}