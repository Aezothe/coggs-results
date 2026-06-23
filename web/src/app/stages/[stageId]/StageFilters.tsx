"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function StageFilters({
  stageId,
  courses,
  classes,
  selectedCourse,
  selectedClass,
}: {
  stageId: string;
  courses: string[];
  classes: string[];
  selectedCourse: string;
  selectedClass: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function updateUrl(nextCourse: string, nextClass: string) {
    const sp = new URLSearchParams();
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);
    const qs = sp.toString();
    startTransition(() => {
      router.replace(
        qs ? `/stages/${stageId}?${qs}` : `/stages/${stageId}`,
        { scroll: false },
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-gray-600">Course:</span>
        <select
          value={selectedCourse}
          onChange={(e) => updateUrl(e.target.value, "")}
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
          value={selectedClass}
          onChange={(e) => updateUrl(selectedCourse, e.target.value)}
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

      {(selectedCourse || selectedClass) && (
        <button
          onClick={() => updateUrl("", "")}
          className="text-blue-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}