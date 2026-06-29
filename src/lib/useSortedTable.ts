"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export type SortState<K extends string> = {
  key: K;
  dir: SortDir;
};

/**
 * Generic sortable-table state hook.
 *
 * - `rows`: the data to sort
 * - `getValue`: maps (row, sortKey) → comparable value (string | number | null)
 * - `defaultSort`: which column + direction to use before the user clicks anything
 *
 * Returns sorted rows, current sort state, and an `onSort(key)` toggle.
 * Same column clicked twice flips direction; different column resets to asc.
 * Nulls always sort last regardless of direction.
 */
export function useSortedTable<Row, K extends string>(
  rows: Row[],
  getValue: (row: Row, key: K) => string | number | null,
  defaultSort: SortState<K>,
) {
  const [sort, setSort] = useState<SortState<K>>(defaultSort);

  function onSort(key: K) {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a, sort.key);
      const bv = getValue(b, sort.key);

      // Nulls last, always
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, getValue]);

  return { sorted, sort, onSort };
}