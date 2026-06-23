"use client";

import React from "react";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import { useSortedTable } from "@/lib/useSortedTable";
import { SortableHeader } from "@/components/SortableHeader";
import type { StandingsRow, StageTime, SplitTime } from "./page";

type SplitDef = {
  split_segment_id: string;
  split_name: string;
  split_ordinal: number;
};

type SortKey =
  | "position"
  | "name"
  | "course_name"
  | "class_name"
  | "total_time_ms"
  | "time_back_ms"
  | `stage:${string}`
  | `split:${string}`;

// Choose class-scoped or course-scoped values based on whether a class is selected.
function stagePositionFor(
  stage: StageTime | undefined,
  classSelected: boolean,
): number | null {
  if (!stage) return null;
  return classSelected
    ? (stage.stage_position_class ?? null)
    : (stage.stage_position_course ?? null);
}

function splitPositionFor(
  split: SplitTime | undefined,
  classSelected: boolean,
): number | null {
  if (!split) return null;
  return classSelected
    ? (split.split_position_class ?? null)
    : (split.split_position_course ?? null);
}

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

  const classSelected = Boolean(klass);

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
      opts.nextStageIds ?? (selectedStageIds === null ? [] : selectedStageIds);

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
    setSelectedStageIds(null);
    updateUrl({ nextCourse: v, nextClass: "", nextStageIds: [] });
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
    updateUrl({ nextStageIds: [] });
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
    return standings.filter((r) => {
      if (r.course_name !== course) return false;
      if (r.scope_type !== displayScope) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });
  }, [standings, course, displayScope, klass]);

  const stageMap = useMemo(() => {
    const map = new Map<string, Map<string, StageTime>>();
    for (const row of stageTimes) {
      if (!map.has(row.entry_id)) map.set(row.entry_id, new Map());
      map.get(row.entry_id)!.set(row.stage_id, row);
    }
    return map;
  }, [stageTimes]);

  const splitMap = useMemo(() => {
    const map = new Map<string, Map<string, SplitTime>>();
    for (const row of splitTimes) {
      if (!map.has(row.entry_id)) map.set(row.entry_id, new Map());
      map.get(row.entry_id)!.set(row.split_segment_id, row);
    }
    return map;
  }, [splitTimes]);

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

  const visibleStages = useMemo(() => {
    if (selectedStageIds === null) return stageList;
    const set = new Set(selectedStageIds);
    return stageList.filter((s) => set.has(s.stage_id));
  }, [stageList, selectedStageIds]);

  const getValue = useCallback(
    (row: StandingsRow, key: SortKey): string | number | null => {
      if (key === "position") {
        return row.is_dnf ? null : (row.position ?? null);
      }
      if (key === "name") {
        return `${row.last_name ?? ""} ${row.first_name ?? ""}`
          .trim()
          .toLowerCase();
      }
      if (key === "course_name") return row.course_name ?? null;
      if (key === "class_name") return row.class_name ?? null;
      if (key === "total_time_ms") {
        return row.is_dnf ? null : (row.total_time_ms ?? null);
      }
      if (key === "time_back_ms") {
        return row.is_dnf ? null : (row.time_back_ms ?? null);
      }
      if (key.startsWith("stage:")) {
        const stageId = key.slice("stage:".length);
        const t = stageMap.get(row.entry_id)?.get(stageId)?.time_ms;
        return t ?? null;
      }
      if (key.startsWith("split:")) {
        const splitId = key.slice("split:".length);
        const t = splitMap.get(row.entry_id)?.get(splitId)?.time_ms;
        return t ?? null;
      }
      return null;
    },
    [stageMap, splitMap],
  );

  const { sorted, sort, onSort } = useSortedTable<StandingsRow, SortKey>(
    filtered,
    getValue,
    { key: "position", dir: "asc" },
  );

  return (
    <div>
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
          {sorted.length} of{" "}
          {standings.filter((r) => r.course_name === course).length}
        </span>
      </div>

      {stageList.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
          <span className="text-gray-600">Stages:</span>
          {stageList.map((s) => {
            const checked =
              selectedStageIds === null ||
              selectedStageIds.includes(s.stage_id);
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

      {sorted.length === 0 ? (
        <p className="text-gray-500">
          No results match the current course and class selection.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <SortableHeader<SortKey>
                  label="Pos"
                  sortKey="position"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  className="w-12"
                />
                <SortableHeader<SortKey>
                  label="Name"
                  sortKey="name"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                />
                <SortableHeader<SortKey>
                  label="Course"
                  sortKey="course_name"
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

                {visibleStages.map((s) => {
                  const splits = showSplits
                    ? (splitsByStageId.get(s.stage_id) ?? [])
                    : [];
                  return (
                    <React.Fragment key={`stage-group-${s.stage_id}`}>
                      <SortableHeader<SortKey>
                        label={
                          <span>
                            {s.name}
                            {splits.length > 0 && (
                              <span className="block text-xs font-normal text-gray-500">
                                stage
                              </span>
                            )}
                          </span>
                        }
                        sortKey={`stage:${s.stage_id}`}
                        currentKey={sort.key}
                        currentDir={sort.dir}
                        onSort={onSort}
                        align="right"
                        className="min-w-[90px] border-l border-gray-200"
                      />
                      {splits.map((sp) => (
                        <SortableHeader<SortKey>
                          key={`split-${sp.split_segment_id}`}
                          label={
                            <span className="text-xs font-normal text-gray-600">
                              {sp.split_name}
                            </span>
                          }
                          sortKey={`split:${sp.split_segment_id}`}
                          currentKey={sort.key}
                          currentDir={sort.dir}
                          onSort={onSort}
                          align="right"
                          className="min-w-[75px]"
                        />
                      ))}
                    </React.Fragment>
                  );
                })}

                <SortableHeader<SortKey>
                  label="Total"
                  sortKey="total_time_ms"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  align="right"
                  className="min-w-[90px] border-l border-gray-200"
                />
                <SortableHeader<SortKey>
                  label="Back"
                  sortKey="time_back_ms"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  align="right"
                  className="min-w-[90px]"
                />
              </tr>
            </thead>

            <tbody className="divide-y">
              {sorted.map((row) => (
                <tr key={row.entry_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 align-top">
                    {row.is_dnf ? "—" : (row.position ?? "")}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.person_id ? (
                      <Link href={`/person/${row.person_id}`}>
                        {row.first_name} {row.last_name}
                      </Link>
                    ) : (
                      <>
                        {row.first_name} {row.last_name}
                      </>
                    )}
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
                    const stagePos = stagePositionFor(stage, classSelected);
                    return (
                      <React.Fragment key={`stage-group-${s.stage_id}`}>
                        <td className="px-4 py-2 text-right tabular-nums align-top min-w-[90px] border-l border-gray-200">
                          <div className="leading-tight">
                            <div>
                              {stage?.time_ms
                                ? formatTime(stage.time_ms)
                                : ""}
                            </div>
                            <div className="text-xs text-gray-500">
                              {stagePos ?? ""}
                            </div>
                          </div>
                        </td>
                        {splits.map((sp) => {
                          const split = splitMap
                            .get(row.entry_id)
                            ?.get(sp.split_segment_id);
                          const splitPos = splitPositionFor(
                            split,
                            classSelected,
                          );
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
                                  {splitPos ?? ""}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </React.Fragment>
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