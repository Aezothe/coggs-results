"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import type { StandingsRow } from "./page";

export function StandingsTable({
  standings,
  courses,
  classes,
  initialCourse,
  initialClass,
  eventId,
}: {
  standings: StandingsRow[];
  courses: string[];
  classes: string[];
  initialCourse: string;
  initialClass: string;
  eventId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [course, setCourse] = useState(initialCourse);
  const [klass, setKlass] = useState(initialClass);

  // Push the filter state into the URL so it's shareable + survives reload.
  function updateUrl(nextCourse: string, nextClass: string) {
    const sp = new URLSearchParams();
    sp.set("event", eventId);
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);
    startTransition(() => {
      router.replace(`/leaderboard?${sp.toString()}`, { scroll: false });
    });
  }

  function onCourseChange(v: string) {
    setCourse(v);
    updateUrl(v, klass);
  }
  function onClassChange(v: string) {
    setKlass(v);
    updateUrl(course, v);
  }

  // When the course filter changes, narrow the class list to classes
  // that actually exist within the selected course. Mirrors how the
  // old leaderboard.js did dependent filters.
  const visibleClasses = useMemo(() => {
    if (!course) return classes;
    const set = new Set<string>();
    for (const r of standings) {
      if (r.course_name === course && r.class_name) set.add(r.class_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [course, classes, standings]);

  const filtered = useMemo(() => {
    return standings.filter((r) => {
      if (course && r.course_name !== course) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });
  }, [standings, course, klass]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm">
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

        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Class:</span>
          <select
            value={klass}
            onChange={(e) => onClassChange(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {visibleClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {(course || klass) && (
          <button
            onClick={() => {
              setCourse("");
              setKlass("");
              updateUrl("", "");
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} of {standings.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">No results match the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-12">Pos</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Course</th>
                <th className="text-left px-3 py-2">Class</th>
                <th className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.entry_id}
                  className="border-t border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2">
                    {row.first_name} {row.last_name}
                  </td>
                  <td className="px-3 py-2">{row.course_name ?? ""}</td>
                  <td className="px-3 py-2">{row.class_name ?? ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.is_dnf ? "DNF" : formatTime(row.total_time_ms)}
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