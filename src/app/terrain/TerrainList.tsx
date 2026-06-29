"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { TerrainSummary } from "./page";

type SortKey = "name" | "stage_count";

export function TerrainList({ tags }: { tags: TerrainSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, query]);

  const getValue = useCallback((row: TerrainSummary, key: SortKey) => {
    switch (key) {
      case "name":
        return row.name.toLowerCase();
      case "stage_count":
        return row.stage_count;
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<TerrainSummary, SortKey>(
    filtered,
    getValue,
    { key: "stage_count", dir: "desc" },
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by terrain name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-surface-border-strong rounded px-3 py-2 text-sm bg-surface text-surface-foreground placeholder:text-surface-muted"
          autoFocus
        />
        <span className="text-sm text-surface-muted whitespace-nowrap">
          {filtered.length} of {tags.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-surface-muted text-sm">No terrain types match.</p>
      ) : (
        <div className="overflow-x-auto text-surface-foreground">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-emphasis">
              <tr>
                <SortableHeader<SortKey>
                  label="Terrain"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Stages"
                  sortKey="stage_count"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {sorted.map((t) => (
                <tr key={t.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2">
                    <Link href={`/terrain/${t.id}`}>
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-surface-muted">
                    {t.stage_count}
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