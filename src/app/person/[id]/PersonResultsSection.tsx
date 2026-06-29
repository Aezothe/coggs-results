"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PercentileChart } from "./PercentileChart";
import { PersonResultsTable } from "./PersonResultsTable";
import type { PersonResult } from "./page";

export function PersonResultsSection({
  results,
}: {
  results: PersonResult[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [course, setCourse] = useState(searchParams.get("course") ?? "");
  const [klass, setKlass] = useState(searchParams.get("class") ?? "");

  const courses = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (r.course_name) set.add(r.course_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [results]);

  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (course && r.course_name !== course) continue;
      if (r.class_name) set.add(r.class_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [results, course]);

  function updateUrl(nextCourse: string, nextClass: string) {
    const sp = new URLSearchParams();
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);
    startTransition(() => {
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onCourseChange(v: string) {
    setCourse(v);
    setKlass("");
    updateUrl(v, "");
  }

  function onClassChange(v: string) {
    setKlass(v);
    updateUrl(course, v);
  }

  function onClear() {
    setCourse("");
    setKlass("");
    updateUrl("", "");
  }

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (course && r.course_name !== course) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });
  }, [results, course, klass]);

  const hasFilters = Boolean(course || klass);
  const raceCount = results.length;
  const summaryText = `${raceCount} race${raceCount === 1 ? "" : "s"}`;

  return (
    <details className="mb-8 group rounded-lg p-4 border bg-surface border-surface-border">
      <summary className="cursor-pointer select-none flex items-center justify-between py-2 list-none">
        <div className="flex items-center gap-2">
          <span className="text-xs transition-transform group-open:rotate-90 text-surface-muted">
            ▶
          </span>
          <h2 className="text-lg font-medium text-surface-foreground">
            Race Results
          </h2>
        </div>
        <span className="text-sm text-surface-muted">{summaryText}</span>
      </summary>

      <div className="pt-4 border-t border-surface-border">
        <PercentileChart results={filtered} />

        <div className="flex flex-wrap items-center gap-3 my-4 text-sm border-y py-3 px-3 rounded bg-surface-hover border-surface-border">
          <span className="text-xs uppercase tracking-wide font-medium text-surface-muted">
            Filter
          </span>

          <label className="flex items-center gap-2">
            <span className="text-surface-muted">Course:</span>
            <select
              value={course}
              onChange={(e) => onCourseChange(e.target.value)}
              className="rounded px-2 py-1 text-sm border bg-surface border-surface-border-strong text-surface-foreground"
            >
              <option value="">All</option>
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-surface-muted">Class:</span>
            <select
              value={klass}
              onChange={(e) => onClassChange(e.target.value)}
              className="rounded px-2 py-1 text-sm border bg-surface border-surface-border-strong text-surface-foreground"
            >
              <option value="">All</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={onClear}
              className="text-primary hover:underline"
            >
              Clear filters
            </button>
          )}

          <span className="ml-auto text-surface-muted">
            {filtered.length} of {results.length}
          </span>
        </div>

        <PersonResultsTable results={filtered} />
      </div>
    </details>
  );
}