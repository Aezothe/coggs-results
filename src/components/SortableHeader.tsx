"use client";

import type { SortDir } from "@/lib/useSortedTable";

export function SortableHeader<K extends string>({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
  className = "",
}: {
  label: React.ReactNode;
  sortKey: K;
  currentKey: K;
  currentDir: SortDir;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = currentKey === sortKey;
  const arrow = isActive ? (currentDir === "asc" ? "▲" : "▼") : "";

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none px-3 py-2 sticky top-0 bg-surface-emphasis ${
        align === "right" ? "text-right" : "text-left"
      } ${isActive ? "text-surface-foreground" : "text-surface-muted"} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span
          className={`text-xs ${
            isActive ? "text-surface-muted" : "text-transparent"
          }`}
        >
          {arrow || "▲"}
        </span>
      </span>
    </th>
  );
}