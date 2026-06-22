"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import type { StandingsRow, ScopeType, StageTime } from "./page";


const SCOPES: { value: ScopeType; label: string }[] = [
  { value: "overall", label: "Overall" },
  { value: "class", label: "Class" },
  { value: "age", label: "Age" },
];

export function StandingsTable({
  standings,
  stageTimes,
  courses,
  classes,
  initialCourse,
  initialClass,
  initialScope,
  eventId,
}: {
  standings: StandingsRow[];
  stageTimes: StageTime[];
  courses: string[];
  classes: string[];
  initialCourse: string;
  initialClass: string;
  initialScope: ScopeType;
  eventId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [scope, setScope] = useState<ScopeType>(initialScope);
  const [course, setCourse] = useState(initialCourse);
  const [klass, setKlass] = useState(initialClass);

  const filtered = useMemo(() => {
    return standings.filter((r) => {
      if (course && r.course_name !== course) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });
  }, [standings, course, klass]);

  const stageMap = useMemo(() => {
    const map = new Map<string, Map<string, any>>();
  
    for (const row of stageTimes) {
      if (!map.has(row.entry_id)) {
        map.set(row.entry_id, new Map());
      }
      map.get(row.entry_id)!.set(row.stage_id, row);
    }
  
    return map;
  }, [stageTimes]);

  const stageList = useMemo(() => {
    const map = new Map<string, { name: string; ordinal: number }>();
  
    for (const row of filtered) {
      const stagesForEntry = stageMap.get(row.entry_id);
      if (!stagesForEntry) continue;
  
      for (const [stage_id, stage] of stagesForEntry.entries()) {
        if (stage.time_ms == null) continue; // ✅ ignore empty stages
  
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

  function updateUrl(
    nextScope: ScopeType,
    nextCourse: string,
    nextClass: string,
  ) {
    const sp = new URLSearchParams();
    sp.set("scope", nextScope);
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);
    startTransition(() => {
      router.replace(`/leaderboard/${eventId}?${sp.toString()}`, { scroll: false });
    });
  }

  function onScopeChange(v: ScopeType) {
    setScope(v);
    updateUrl(v, course, klass);
  }

  function onCourseChange(v: string) {
    setCourse(v);
    updateUrl(scope, v, klass);
  }

  function onClassChange(v: string) {
    setKlass(v);
    updateUrl(scope, course, v);
  }

  const visibleClasses = useMemo(() => {
    if (!course) return classes;
    const set = new Set<string>();
    for (const r of standings) {
      if (r.course_name === course && r.class_name) set.add(r.class_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [course, classes, standings]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        {/* Scope toggle */}
        <div className="inline-flex rounded border border-gray-300 overflow-hidden text-sm">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => onScopeChange(s.value)}
              className={`px-3 py-1 ${
                scope === s.value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

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
              updateUrl(scope, "", "");
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
        <p className="text-gray-500">No results match the current scope and filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-gray-100 text-gray-900 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-12">Pos</th>
                <th className="text-left px-3 py-2 align-top">Name</th>
                <th className="text-left px-3 py-2">Course</th>
                <th className="text-left px-3 py-2">Class</th>

                {stageList.map((s) => (
                <th key={s.stage_id}>{s.name}</th>
                ))}

                {scope === "age" && (
                  <th className="text-left px-3 py-2">Age Group</th>
                )}
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Back</th>
              </tr>
            </thead>
            <tbody className="divide-y">
            {filtered.map((row) => (
              <tr key={row.entry_id}>
                <td>{row.is_dnf ? "—" : row.position ?? ""}</td>

                <td>
                  {row.first_name} {row.last_name}
                </td>

                <td>{row.course_name ?? ""}</td>
                <td>{row.class_name ?? ""}</td>

                {/* ✅ STAGE COLUMNS (each its own td) */}
                {stageList.map((s) => {
                  const stage = stageMap.get(row.entry_id)?.get(s.stage_id);

                  return (
                  <td key={s.stage_id} className="px-3 py-2 tabular-numbs text-right align-top">
                    <div className="leading-tight">
                      <div>{stage?.time_ms ? formatTime(stage.time_ms) : ""}</div>
                      <div className="text-xs text-gray-500">
                        {stage?.stage_position ?? ""}
                      </div>
                    </div>
                  </td>
                  );
                })}

                <td className="px-3 py-2 text-right tabular-nums align-top">
                  <div>
                    {row.is_dnf ? "DNF" : formatTime(row.total_time_ms)}
                  </div>
                  <div className="text-xs text-gray-500">&nbsp;</div>
                </td>

                <td className="px-3 py-2 text-right tabular-nums text-gray-600 align-top">
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