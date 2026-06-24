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
  | "course_name"
  | "class_name"
  | "total_time_ms"
  | "time_back_ms"
  | `stage:${string}`
  | `split:${string}`;

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

function displayName(row: StandingsRow): string {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Unnamed";
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
  initialSelectedRiderIds,
  initialCompareOnly,
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
  initialSelectedRiderIds: string[];
  initialCompareOnly: boolean;
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

  // Rider compare state
  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>(
    initialSelectedRiderIds,
  );
  const [compareOnly, setCompareOnly] = useState(initialCompareOnly);
  const [riderQuery, setRiderQuery] = useState("");

  const classSelected = Boolean(klass);

  function updateUrl(opts: {
    nextCourse?: string;
    nextClass?: string;
    nextShowSplits?: boolean;
    nextStageIds?: string[];
    nextRiderIds?: string[];
    nextCompareOnly?: boolean;
  }) {
    const nextCourse = opts.nextCourse ?? course;
    const nextClass = opts.nextClass ?? klass;
    const nextShowSplits = opts.nextShowSplits ?? showSplits;
    const nextStageIds =
      opts.nextStageIds ?? (selectedStageIds === null ? [] : selectedStageIds);
    const nextRiderIds = opts.nextRiderIds ?? selectedRiderIds;
    const nextCompareOnly = opts.nextCompareOnly ?? compareOnly;

    const sp = new URLSearchParams();
    if (nextCourse) sp.set("course", nextCourse);
    if (nextClass) sp.set("class", nextClass);
    if (nextShowSplits) sp.set("splits", "1");
    if (nextStageIds.length > 0) sp.set("stages", nextStageIds.join(","));
    if (nextRiderIds.length > 0) sp.set("riders", nextRiderIds.join(","));
    if (nextCompareOnly && nextRiderIds.length > 0) sp.set("compare", "1");

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
    setSelectedRiderIds([]);
    setCompareOnly(false);
    updateUrl({
      nextCourse: v,
      nextClass: "",
      nextStageIds: [],
      nextRiderIds: [],
      nextCompareOnly: false,
    });
  }

  function onClassChange(v: string) {
    setKlass(v);
    setSelectedRiderIds([]);
    setCompareOnly(false);
    updateUrl({
      nextClass: v,
      nextRiderIds: [],
      nextCompareOnly: false,
    });
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

  function onAddRider(entryId: string) {
    if (selectedRiderIds.includes(entryId)) return;
    const next = [...selectedRiderIds, entryId];
    setSelectedRiderIds(next);
    setRiderQuery("");
    updateUrl({ nextRiderIds: next });
  }

  function onRemoveRider(entryId: string) {
    const next = selectedRiderIds.filter((id) => id !== entryId);
    setSelectedRiderIds(next);
    const stillCompareOnly = compareOnly && next.length > 0;
    if (compareOnly && !stillCompareOnly) {
      setCompareOnly(false);
    }
    updateUrl({
      nextRiderIds: next,
      nextCompareOnly: stillCompareOnly,
    });
  }

  function onClearRiders() {
    setSelectedRiderIds([]);
    setCompareOnly(false);
    updateUrl({ nextRiderIds: [], nextCompareOnly: false });
  }

  function onToggleCompareOnly() {
    if (selectedRiderIds.length === 0) return;
    const next = !compareOnly;
    setCompareOnly(next);
    updateUrl({ nextCompareOnly: next });
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

  // Riders in the current course/scope (compare candidates)
  const scopedRiders = useMemo(() => {
    return standings.filter((r) => {
      if (r.course_name !== course) return false;
      if (r.scope_type !== displayScope) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });
  }, [standings, course, displayScope, klass]);

  // For chip display & search dropdown, build entry_id → row map
  const ridersById = useMemo(() => {
    const map = new Map<string, StandingsRow>();
    for (const r of scopedRiders) map.set(r.entry_id, r);
    return map;
  }, [scopedRiders]);

  // Search dropdown matches: case-insensitive, not-already-selected,
  // capped at 8 results
  const riderMatches = useMemo(() => {
    const q = riderQuery.trim().toLowerCase();
    if (!q) return [];
    const selectedSet = new Set(selectedRiderIds);
    const matches: StandingsRow[] = [];
    for (const r of scopedRiders) {
      if (selectedSet.has(r.entry_id)) continue;
      if (displayName(r).toLowerCase().includes(q)) {
        matches.push(r);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [riderQuery, scopedRiders, selectedRiderIds]);

  // The filtered (compare-only) set when active
  const filtered = useMemo(() => {
    const base = compareOnly && selectedRiderIds.length > 0
      ? scopedRiders.filter((r) => selectedRiderIds.includes(r.entry_id))
      : scopedRiders;

    return [...base].sort((a, b) => {
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
  }, [scopedRiders, compareOnly, selectedRiderIds]);

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

  const totalInCourse = standings.filter((r) => r.course_name === course).length;

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
          {compareOnly && selectedRiderIds.length > 0
            ? `Comparing ${sorted.length} of ${totalInCourse}`
            : `${sorted.length} of ${totalInCourse}`}
        </span>
      </div>

      {/* Compare riders */}
      <div className="mb-4 text-sm">
        <div className="relative max-w-md">
          <input
            type="search"
            placeholder="Compare riders — type a name to add"
            value={riderQuery}
            onChange={(e) => setRiderQuery(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 w-full text-sm"
          />
          {riderMatches.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-10 border border-gray-200 bg-white rounded shadow-md max-h-72 overflow-y-auto">
              {riderMatches.map((r) => (
                <li key={r.entry_id}>
                  <button
                    type="button"
                    onClick={() => onAddRider(r.entry_id)}
                    className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
                  >
                    <span className="text-gray-900">{displayName(r)}</span>
                    {r.class_name && (
                      <span className="text-gray-500 ml-2 text-xs">
                        {r.class_name}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedRiderIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {selectedRiderIds.map((entryId) => {
              const row = ridersById.get(entryId);
              if (!row) return null;
              return (
                <span
                  key={entryId}
                  className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded"
                >
                  {displayName(row)}
                  <button
                    type="button"
                    aria-label={`Remove ${displayName(row)}`}
                    onClick={() => onRemoveRider(entryId)}
                    className="text-gray-500 hover:text-gray-800 leading-none ml-0.5"
                  >
                    ×
                  </button>
                </span>
              );
            })}

            <button
              type="button"
              onClick={onToggleCompareOnly}
              className={`text-xs px-2 py-0.5 rounded border ${
                compareOnly
                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {compareOnly
                ? "Showing selected only"
                : `Show only selected (${selectedRiderIds.length})`}
            </button>

            <button
              type="button"
              onClick={onClearRiders}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear
            </button>
          </div>
        )}
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
          {compareOnly && selectedRiderIds.length > 0
            ? "No selected riders are in the current course/class filter."
            : "No results match the current course and class selection."}
        </p>
      ) : (
        <div className="overflow-auto max-h-[calc(100vh-140px)] sm:max-h-[calc(100vh-200px)] lg:max-h-[calc(100vh-220px)]">
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-gray-100">
              <tr>
              <SortableHeader<SortKey>
                label="Rider"
                sortKey="position"
                currentKey={sort.key}
                currentDir={sort.dir}
                onSort={onSort}
                className="sticky left-0 bg-gray-100 z-20 min-w-[180px]"
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
                <tr key={row.entry_id} className="group hover:bg-gray-50">
                  <td className="px-3 py-2 align-top sticky left-0 bg-white group-hover:bg-gray-50 z-10 min-w-[180px]">
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500 tabular-nums text-xs w-6 shrink-0">
                        {row.is_dnf ? "—" : (row.position ?? "")}
                      </span>
                      <div className="leading-tight">
                        {row.person_id ? (
                          <Link href = {`/person/${row.person_id}`}>
                            {row.first_name} {row.last_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">
                            {row.first_name} {row.last_name}
                          </span>
                        )}
                        <div className="text-xs text-gray-500">
                          {[row.course_name, row.class_name].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
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