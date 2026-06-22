"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import type { StandingsRow, StageTime, SplitTime } from "./page";

type SplitDef = {
  split_segment_id: string;
  split_name: string;
  split_ordinal: number;
};

export function StandingsTable({
  standings,
  stageTimes,
  splitTimes,
  courses,
  classes,
  initialCourse,
  initialClass,
  initialShowSplits,
  initialSelectedStageIds,
  eventId,
}: {
  standings: StandingsRow[];
  stageTimes: StageTime[];
  splitTimes: SplitTime[];
  courses: string[];
  classes: string[];
  initialCourse: string;
  initialClass: string;
  initialShowSplits: boolean;
  initialSelectedStageIds: string[];
  eventId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [course, setCourse] = useState(initialCourse);
  const [klass, setKlass] = useState(initialClass);
  const [showSplits, setShowSplits] = useState(initialShowSplits);
  const [selectedStageIds, setSelectedStageIds] = useState<string[] | null>(
    initialSelectedStageIds.length > 0 ? initialSelectedStageIds : null,
  );
  

  function updateUrl(opts: {
    nextCourse?: string;
    nextClass?: string;
    nextShowSplits?: boolean;
    nextStageIds?: string[];
  }) {
    const nextCourse = opts.nextCourse ?? course;
    const nextClass = opts.nextClass ?? klass;
    const nextShowSplits = opts.nextShowSplits ?? showSplits;
    const nextStageIds =
    opts.nextStageIds ??
    (selectedStageIds === null ? [] : selectedStageIds);

    const sp = new URLSearchParams();
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);
    if (nextShowSplits) sp.set("splits", "1");
    if (nextStageIds.length > 0) sp.set("stages", nextStageIds.join(","));

    startTransition(() => {
      const qs = sp.toString();
      router.replace(
        qs ? `/leaderboard/${eventId}?${qs}` : `/leaderboard/${eventId}`,
        { scroll: false },
      );
    });
  }

  function onCourseChange(v: string) {
    setCourse(v);
    setKlass("");
    setSelectedStageIds(null); // "all" on the new course
    updateUrl({
      nextCourse: v,
      nextClass: "",
      nextStageIds: [], // empty in URL = "all"
    });
  }

  function onClassChange(v: string) {
    setKlass(v);
    updateUrl({ nextClass: v });
  }

  function onToggleSplits() {
    const next = !showSplits;
    setShowSplits(next);
    updateUrl({ nextShowSplits: next });
  }

  function onToggleStage(stageId: string) {
    // If "all" is active, start from the full stageList minus the one being toggled
    if (selectedStageIds === null) {
      const next = stageList
        .map((s) => s.stage_id)
        .filter((id) => id !== stageId);
      setSelectedStageIds(next);
      updateUrl({ nextStageIds: next });
      return;
    }
  
    const next = selectedStageIds.includes(stageId)
      ? selectedStageIds.filter((id) => id !== stageId)
      : [...selectedStageIds, stageId];
    setSelectedStageIds(next);
    updateUrl({ nextStageIds: next });
  }
  
  function onSelectAllStages() {
    setSelectedStageIds(null);
    updateUrl({ nextStageIds: [] }); // empty in URL = "all"
  }

  const displayScope = klass ? "class" : "overall";

  const visibleClasses = useMemo(() => {
    const set = new Set<string>();
    for (const r of standings) {
      if (r.course_name === course && r.class_name) {
        set.add(r.class_name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [course, standings]);

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

  // entry_id -> stage_id -> stage time row
  const stageMap = useMemo(() => {
    const map = new Map<string, Map<string, StageTime>>();
    for (const row of stageTimes) {
      if (!map.has(row.entry_id)) map.set(row.entry_id, new Map());
      map.get(row.entry_id)!.set(row.stage_id, row);
    }
    return map;
  }, [stageTimes]);

  // entry_id -> split_segment_id -> split time row
  const splitMap = useMemo(() => {
    const map = new Map<string, Map<string, SplitTime>>();
    for (const row of splitTimes) {
      if (!map.has(row.entry_id)) map.set(row.entry_id, new Map());
      map.get(row.entry_id)!.set(row.split_segment_id, row);
    }
    return map;
  }, [splitTimes]);

  // canonical stage_id -> splits (in ordinal order)
  const splitsByStageId = useMemo(() => {
    const map = new Map<string, Map<string, SplitDef>>();
    for (const row of splitTimes) {
      if (!map.has(row.parent_stage_id)) {
        map.set(row.parent_stage_id, new Map());
      }
      const inner = map.get(row.parent_stage_id)!;
      if (!inner.has(row.split_segment_id)) {
        inner.set(row.split_segment_id, {
          split_segment_id: row.split_segment_id,
          split_name: row.split_name,
          split_ordinal: row.split_ordinal,
        });
      }
    }

    const out = new Map<string, SplitDef[]>();
    for (const [stageId, inner] of map.entries()) {
      out.set(
        stageId,
        Array.from(inner.values()).sort(
          (a, b) => a.split_ordinal - b.split_ordinal,
        ),
      );
    }
    return out;
  }, [splitTimes]);

  // All stages that have data for currently-filtered riders
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

  // After stage filter
  const visibleStages = useMemo(() => {
    if (selectedStageIds === null) return stageList;
    const set = new Set(selectedStageIds);
    return stageList.filter((s) => set.has(s.stage_id));
  }, [stageList, selectedStageIds]);

  return (
    <div>
      {/* Top filter row */}
      <div className="flex flex-wrap gap-3 mb-3 items-center">
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showSplits}
            onChange={onToggleSplits}
          />
          <span className="text-gray-700">Show splits</span>
        </label>

        <span className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} of{" "}
          {standings.filter((r) => r.course_name === course).length}
        </span>
      </div>

      {/* Stage filter row */}
      {stageList.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
          <span className="text-gray-600">Stages:</span>
          {stageList.map((s) => {
            const checked =
              selectedStageIds === null || selectedStageIds.includes(s.stage_id);
            return (
              <label
                key={s.stage_id}
                className="flex items-center gap-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStage(s.stage_id)}
                />
                <span>{s.name}</span>
              </label>
            );
          })}
          {selectedStageIds !== null && (
            <button
              onClick={onSelectAllStages}
              className="text-blue-600 hover:underline"
            >
              Show all
            </button>
          )}
        </div>
      )}

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

                {visibleStages.map((s) => {
                  const splits = showSplits
                    ? (splitsByStageId.get(s.stage_id) ?? [])
                    : [];

                  return (
                    <>
                      <th
                        key={`stage-${s.stage_id}`}
                        className="text-right px-4 py-2 min-w-[90px] border-l border-gray-200"
                      >
                        <div>{s.name}</div>
                        {splits.length > 0 && (
                          <div className="text-xs font-normal text-gray-500">
                            stage
                          </div>
                        )}
                      </th>
                      {splits.map((sp) => (
                        <th
                          key={`split-${sp.split_segment_id}`}
                          className="text-right px-3 py-2 min-w-[75px]"
                        >
                          <div className="text-xs font-normal text-gray-600">
                            {sp.split_name}
                          </div>
                        </th>
                      ))}
                    </>
                  );
                })}

                <th className="text-right px-4 py-2 min-w-[90px] border-l border-gray-200">
                  Total
                </th>
                <th className="text-right px-4 py-2 min-w-[90px]">Back</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filtered.map((row) => (
                <tr key={row.entry_id}>
                  <td className="px-3 py-2 align-top">
                    {row.is_dnf ? "—" : (row.position ?? "")}
                  </td>

                  <td className="px-3 py-2 align-top">
                    {row.first_name} {row.last_name}
                  </td>

                  <td className="px-3 py-2 align-top">
                    {row.course_name ?? ""}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.class_name ?? ""}
                  </td>

                  {visibleStages.map((s) => {
                    const stage = stageMap.get(row.entry_id)?.get(s.stage_id);
                    const splits = showSplits
                      ? (splitsByStageId.get(s.stage_id) ?? [])
                      : [];

                    return (
                      <>
                        <td
                          key={`stage-${s.stage_id}`}
                          className="px-4 py-2 text-right tabular-nums align-top min-w-[90px] border-l border-gray-200"
                        >
                          <div className="leading-tight">
                            <div>
                              {stage?.time_ms
                                ? formatTime(stage.time_ms)
                                : ""}
                            </div>
                            <div className="text-xs text-gray-500">
                              {stage?.stage_position ?? ""}
                            </div>
                          </div>
                        </td>
                        {splits.map((sp) => {
                          const split = splitMap
                            .get(row.entry_id)
                            ?.get(sp.split_segment_id);
                          return (
                            <td
                              key={`split-${sp.split_segment_id}`}
                              className="px-3 py-2 text-right tabular-nums align-top min-w-[75px] bg-gray-50"
                            >
                              <div className="leading-tight">
                                <div className="text-gray-700">
                                  {split?.time_ms
                                    ? formatTime(split.time_ms)
                                    : ""}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {split?.split_position ?? ""}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </>
                    );
                  })}

                  <td className="px-4 py-2 text-right tabular-nums align-top min-w-[90px] border-l border-gray-200">
                    <div>
                      {row.is_dnf ? "DNF" : formatTime(row.total_time_ms)}
                    </div>
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