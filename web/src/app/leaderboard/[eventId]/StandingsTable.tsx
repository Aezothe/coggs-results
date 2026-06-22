"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import type { StandingsRow, StageTime } from "./page";

export function StandingsTable({
  standings,
  stageTimes,
  courses,
  classes,
  initialCourse,
  initialClass,
  eventId,
}: {
  standings: StandingsRow[];
  stageTimes: StageTime[];
  courses: string[];
  classes: string[];
  initialCourse: string;
  initialClass: string;
  eventId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Course is required — no "All"
  const [course, setCourse] = useState(initialCourse);
  // Class is optional — blank means "overall within course"
  const [klass, setKlass] = useState(initialClass);

  function updateUrl(nextCourse: string, nextClass: string) {
    const sp = new URLSearchParams();
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);

    startTransition(() => {
      const qs = sp.toString();
      router.replace(
        qs ? `/leaderboard/${eventId}?${qs}` : `/leaderboard/${eventId}`,
        { scroll: false },
      );
    });
  }

  function onCourseChange(v: string) {
    // When course changes, reset class
    setCourse(v);
    setKlass("");
    updateUrl(v, "");
  }

  function onClassChange(v: string) {
    setKlass(v);
    updateUrl(course, v);
  }

  // Dynamic "mode":
  // - no class selected => show overall-for-course
  // - class selected    => show class-for-course
  const displayScope = klass ? "class" : "overall";

  // Class options only for the selected course
  const visibleClasses = useMemo(() => {
    const set = new Set<string>();
    for (const r of standings) {
      if (r.course_name === course && r.class_name) {
        set.add(r.class_name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [course, standings]);

  // Filter standings to:
  // 1) selected course
  // 2) selected scope (overall or class)
  // 3) selected class if one is chosen
  const filtered = useMemo(() => {
    const rows = standings.filter((r) => {
      if (r.course_name !== course) return false;
      if (r.scope_type !== displayScope) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      const ad = !!a.is_dnf;
      const bd = !!b.is_dnf;
      if (ad !== bd) return ad ? 1 : -1;

      const ap = a.position ?? Number.MAX_SAFE_INTEGER;
      const bp = b.position ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;

      const al = (a.last_name ?? "").localeCompare(b.last_name ?? "");
      if (al !== 0) return al;
      return (a.first_name ?? "").localeCompare(b.first_name ?? "");
    });
  }, [standings, course, displayScope, klass]);

  // entry_id -> (stage_id -> stage row)
  const stageMap = useMemo(() => {
    const map = new Map<string, Map<string, StageTime>>();

    for (const row of stageTimes) {
      if (!map.has(row.entry_id)) {
        map.set(row.entry_id, new Map());
      }
      map.get(row.entry_id)!.set(row.stage_id, row);
    }

    return map;
  }, [stageTimes]);

  // Only show stages that actually have data for the CURRENT filtered view
  const stageList = useMemo(() => {
    const map = new Map<string, { name: string; ordinal: number }>();

    for (const row of filtered) {
      const stagesForEntry = stageMap.get(row.entry_id);
      if (!stagesForEntry) continue;

      for (const [stage_id, stage] of stagesForEntry.entries()) {
        if (stage.time_ms == null) continue;

        if (!map.has(stage_id)) {
          map.set(stage_id, {
            name: stage.stage_name,
            ordinal: stage.ordinal,
          });
        }
      }
    }

    return Array.from(map.entries())
      .map(([stage_id, v]) => ({ stage_id, ...v }))
      .sort((a, b) => a.ordinal - b.ordinal);
  }, [filtered, stageMap]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Course:</span>
          <select
            value={course}
            onChange={(e) => onCourseChange(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
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

        {klass && (
          <button
            onClick={() => {
              setKlass("");
              updateUrl(course, "");
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear class filter
          </button>
        )}

        <span className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} of {standings.filter((r) => r.course_name === course).length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">
          No results match the current course and class selection.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-gray-100 text-gray-900 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-12">Pos</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Course</th>
                <th className="text-left px-3 py-2">Class</th>

                {stageList.map((s) => (
                  <th
                    key={s.stage_id}
                    className="text-right px-4 py-2 min-w-[90px]"
                  >
                    {s.name}
                  </th>
                ))}

                <th className="text-right px-4 py-2 min-w-[90px]">Total</th>
                <th className="text-right px-4 py-2 min-w-[90px]">Back</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filtered.map((row) => (
                <tr key={row.entry_id}>
                  <td className="px-3 py-2 align-top">
                    {row.is_dnf ? "—" : row.position ?? ""}
                  </td>

                  <td className="px-3 py-2 align-top">
                    {row.first_name} {row.last_name}
                  </td>

                  <td className="px-3 py-2 align-top">{row.course_name ?? ""}</td>

                  <td className="px-3 py-2 align-top">{row.class_name ?? ""}</td>

                  {stageList.map((s) => {
                    const stage = stageMap.get(row.entry_id)?.get(s.stage_id);

                    return (
                      <td
                        key={s.stage_id}
                        className="px-4 py-2 text-right tabular-nums align-top min-w-[90px]"
                      >
                        <div className="leading-tight">
                          <div>{stage?.time_ms ? formatTime(stage.time_ms) : ""}</div>
                          <div className="text-xs text-gray-500">
                            {stage?.stage_position ?? ""}
                          </div>
                        </div>
                      </td>
                    );
                  })}

                  <td className="px-4 py-2 text-right tabular-nums align-top min-w-[90px]">
                    <div>{row.is_dnf ? "DNF" : formatTime(row.total_time_ms)}</div>
                    <div className="text-xs text-gray-500">&nbsp;</div>
                  </td>

                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 align-top min-w-[90px]">
                    <div>
                      {row.is_dnf || row.time_back_ms == null
                        ? ""
                        : `+${formatTime(row.time_back_ms)}`}
                    </div>
                    <div className="text-xs text-gray-500">&nbsp;</div>
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