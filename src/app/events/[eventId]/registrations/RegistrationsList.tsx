"use client";

import { useCallback, useMemo, useState } from "react";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { RegistrationRow } from "./page";

type SortKey = "name" | "course" | "class_name";

type ClassCount = {
  className: string;
  count: number;
};

type CourseCount = {
  courseName: string;
  count: number;
  classes: ClassCount[];
};

function displayName(r: RegistrationRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed";
}

function lastFirstSortKey(r: RegistrationRow): string {
  return `${(r.last_name ?? "").toLowerCase()} ${(r.first_name ?? "").toLowerCase()}`.trim();
}

function computeCounts(registrations: RegistrationRow[]): CourseCount[] {
  const byCourse = new Map<string, Map<string, number>>();

  for (const r of registrations) {
    const courseName = r.course || "Unassigned";
    const className = r.class_name || "Unassigned";
    if (!byCourse.has(courseName)) byCourse.set(courseName, new Map());
    const courseMap = byCourse.get(courseName)!;
    courseMap.set(className, (courseMap.get(className) ?? 0) + 1);
  }

  const courses: CourseCount[] = [];
  for (const [courseName, classMap] of byCourse.entries()) {
    const classes: ClassCount[] = [];
    let total = 0;
    for (const [className, count] of classMap.entries()) {
      classes.push({ className, count });
      total += count;
    }
    classes.sort((a, b) => a.className.localeCompare(b.className));
    courses.push({ courseName, count: total, classes });
  }
  courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
  return courses;
}

export function RegistrationsList({
  registrations,
}: {
  registrations: RegistrationRow[];
}) {
  const [query, setQuery] = useState("");

  const counts = useMemo(() => computeCounts(registrations), [registrations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) =>
      displayName(r).toLowerCase().includes(q),
    );
  }, [registrations, query]);

  const getValue = useCallback((row: RegistrationRow, key: SortKey) => {
    switch (key) {
      case "name":
        return lastFirstSortKey(row);
      case "course":
        return (row.course ?? "").toLowerCase();
      case "class_name":
        return (row.class_name ?? "").toLowerCase();
    }
  }, []);

  const { sorted, sort, onSort } = useSortedTable<RegistrationRow, SortKey>(
    filtered,
    getValue,
    { key: "course", dir: "asc" },
  );

  if (registrations.length === 0) {
    return (
      <p className="text-sm text-surface-muted">
        No registrations yet for this event.
      </p>
    );
  }

  return (
    <div>
      {counts.length > 0 && (
        <div className="mb-6 pb-4 border-b border-surface-border">
          <div className="text-sm font-semibold text-surface-foreground mb-2">
            {registrations.length} total
          </div>
          <ul className="text-sm space-y-1">
            {counts.map((c) => (
              <li key={c.courseName} className="text-surface-foreground">
                <span className="font-medium">{c.courseName}</span>{" "}
                <span className="text-surface-muted">({c.count})</span>
                {c.classes.length > 0 && (
                  <span className="text-surface-muted">
                    {" — "}
                    {c.classes
                      .map((cls) => `${cls.className} (${cls.count})`)
                      .join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-surface-border-strong rounded px-3 py-2 text-sm bg-surface text-surface-foreground placeholder:text-surface-muted"
          autoFocus
        />
        <span className="text-sm text-surface-muted whitespace-nowrap">
          {filtered.length} of {registrations.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-surface-muted text-sm">No matches.</p>
      ) : (
        <div className="overflow-x-auto text-surface-foreground">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-emphasis">
              <tr>
                <SortableHeader<SortKey>
                  label="Name"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Course"
                  sortKey="course"
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
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2">{displayName(r)}</td>
                  <td className="px-3 py-2 text-surface-muted">
                    {r.course ?? ""}
                  </td>
                  <td className="px-3 py-2 text-surface-muted">
                    {r.class_name ?? ""}
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