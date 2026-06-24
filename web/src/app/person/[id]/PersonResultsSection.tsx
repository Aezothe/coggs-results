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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Course:</span>
          <select
            value={course}
            onChange={(e) => onCourseChange(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
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
          <span className="text-gray-600">Class:</span>
          <select
            value={klass}
            onChange={(e) => onClassChange(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {(course || klass) && (
          <button
            type="button"
            onClick={onClear}
            className="text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-gray-500">
          {filtered.length} of {results.length}
        </span>
      </div>

      <PercentileChart results={filtered} />
      <PersonResultsTable results={filtered} />
    </div>
  );
}