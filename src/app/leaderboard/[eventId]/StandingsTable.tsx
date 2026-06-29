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
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>(
    initialSelectedStageIds,
  );

  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>(
    initialSelectedRiderIds,
  );
  const [compareOnly, setCompareOnly] = useState(initialCompareOnly);
  const [riderQuery, setRiderQuery] = useState("");

  const [filtersOpen, setFiltersOpen] = useState<boolean | null>(null);

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
    const nextStageIds = opts.nextStageIds ?? selectedStageIds;
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
    setSelectedStageIds([]);
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
    const next = selectedStageIds.includes(stageId)
      ? selectedStageIds.filter((id) => id !== stageId)
      : [...selectedStageIds, stageId];
    setSelectedStageIds(next);
    updateUrl({ nextStageIds: next });
  }

  function onShowAllStages() {
    const allIds = stageList.map((s) => s.stage_id);
    setSelectedStageIds(allIds);
    updateUrl({ nextStageIds: allIds });
  }

  function onHideAllStages() {
    setSelectedStageIds([]);
    setShowSplits(false);
    updateUrl({ nextStageIds: [], nextShowSplits: false });
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

  const scopedRiders = useMemo(() => {
    return standings.filter((r) => {
      if (r.course_name !== course) return false;
      if (r.scope_type !== displayScope) return false;
      if (klass && r.class_name !== klass) return false;
      return true;
    });
  }, [standings, course, displayScope, klass]);

  const ridersById = useMemo(() => {
    const map = new Map<string, StandingsRow>();
    for (const r of scopedRiders) map.set(r.entry_id, r);
    return map;
  }, [scopedRiders]);

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

  const filtered = useMemo(() => {
    const base =
      compareOnly && selectedRiderIds.length > 0
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
    for (const row of scopedRiders) {
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
  }, [scopedRiders, stageMap]);

  const visibleStages = useMemo(() => {
    const set = new Set(selectedStageIds);
    return stageList.filter((s) => set.has(s.stage_id));
  }, [stageList, selectedStageIds]);

  const getValue = useCallback(
    (row: StandingsRow, key: SortKey): string | number | null => {
      if (key === "position") {
        return row.is_dnf ? null : (row.position ?? null);
      }
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

  const totalInCourse = standings.filter(
    (r) => r.course_name === course,
  ).length;
  const ridersShownLabel = `${sorted.length} of ${totalInCourse} riders`;

  const filtersExplicitlySet = filtersOpen !== null;
  const filtersBlockClasses = filtersExplicitlySet
    ? filtersOpen
      ? "block"
      : "hidden"
    : "hidden sm:block";
  const collapsedSummaryClasses = filtersExplicitlySet
    ? filtersOpen
      ? "hidden"
      : "block"
    : "block sm:hidden";

  const chipBase = "text-xs px-2 py-0.5 rounded border";
  const chipActive =
    "bg-accent-1 text-white border-accent-1 hover:bg-accent-1-hover";
  const chipInactive =
    "bg-surface text-surface-foreground border-surface-border-strong hover:bg-surface-hover";

  return (
    <div className="text-surface-foreground">
      <div className="mb-3">
        <button
          type="button"
          onClick={() =>
            setFiltersOpen((prev) =>
              prev === null
                ? typeof window !== "undefined" && window.innerWidth >= 640
                  ? false
                  : true
                : !prev,
            )
          }
          className="flex w-full items-center justify-between gap-2 text-sm border border-surface-border rounded px-3 py-2 hover:bg-surface-hover sm:hidden"
        >
          <span className="font-medium text-surface-foreground">
            {filtersOpen === false || (filtersOpen === null && true)
              ? "Show filters"
              : "Hide filters"}
          </span>
          <span className="text-surface-muted text-xs">
            {[course, klass].filter(Boolean).join(" · ") || "All"} ·{" "}
            {ridersShownLabel}
          </span>
        </button>
      </div>

      <div className={`${filtersBlockClasses} mb-4`}>
        <div className="flex flex-wrap gap-3 mb-3 items-center">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-surface-muted">Course:</span>
            <select
              value={course}
              onChange={(e) => onCourseChange(e.target.value)}
              className="border border-surface-border-strong rounded px-2 py-1 text-sm bg-surface text-surface-foreground"
            >
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-surface-muted">Class:</span>
            <select
              value={klass}
              onChange={(e) => onClassChange(e.target.value)}
              className="border border-surface-border-strong rounded px-2 py-1 text-sm bg-surface text-surface-foreground"
            >
              <option value="">All</option>
              {visibleClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <span className="ml-auto text-sm text-surface-muted self-center">
            {compareOnly && selectedRiderIds.length > 0
              ? `Comparing ${sorted.length} of ${totalInCourse}`
              : ridersShownLabel}
          </span>
        </div>

        <div className="mb-4 text-sm">
          <div className="relative max-w-md">
            <input
              type="search"
              placeholder="Compare riders — type a name to add"
              value={riderQuery}
              onChange={(e) => setRiderQuery(e.target.value)}
              className="border border-surface-border-strong rounded px-3 py-1.5 w-full text-sm bg-surface text-surface-foreground placeholder:text-surface-muted"
            />
            {riderMatches.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-1 z-30 border border-surface-border bg-surface rounded shadow-md max-h-72 overflow-y-auto">
                {riderMatches.map((r) => (
                  <li key={r.entry_id}>
                    <button
                      type="button"
                      onClick={() => onAddRider(r.entry_id)}
                      className="block w-full text-left px-3 py-1.5 hover:bg-surface-hover"
                    >
                      <span className="text-surface-foreground">
                        {displayName(r)}
                      </span>
                      {r.class_name && (
                        <span className="text-surface-muted ml-2 text-xs">
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
                    className="inline-flex items-center gap-1 bg-surface-emphasis text-surface-foreground text-xs px-2 py-0.5 rounded"
                  >
                    {displayName(row)}
                    <button
                      type="button"
                      aria-label={`Remove ${displayName(row)}`}
                      onClick={() => onRemoveRider(entryId)}
                      className="text-surface-muted hover:text-surface-foreground leading-none ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                );
              })}

              <button
                type="button"
                onClick={onToggleCompareOnly}
                className={`${chipBase} ${compareOnly ? chipActive : chipInactive}`}
              >
                {compareOnly
                  ? "Showing selected only"
                  : `Show only selected (${selectedRiderIds.length})`}
              </button>

              <button
                type="button"
                onClick={onClearRiders}
                className="text-xs text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {stageList.length > 0 && (
          <div className="mb-2 text-sm">
            <div className="text-surface-muted mb-1">Stages</div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {stageList.map((s) => {
                const isOn = selectedStageIds.includes(s.stage_id);
                return (
                  <button
                    key={s.stage_id}
                    type="button"
                    onClick={() => onToggleStage(s.stage_id)}
                    className={`${chipBase} ${isOn ? chipActive : chipInactive}`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onShowAllStages}
                disabled={selectedStageIds.length === stageList.length}
                className={`${chipBase} ${chipInactive} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={onHideAllStages}
                disabled={selectedStageIds.length === 0}
                className={`${chipBase} ${chipInactive} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Hide all
              </button>

              {visibleStages.length > 0 && (
                <button
                  type="button"
                  onClick={onToggleSplits}
                  className={`${chipBase} ${showSplits ? chipActive : chipInactive}`}
                >
                  {showSplits ? "Hide splits" : "Show splits"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`${collapsedSummaryClasses} mb-3 text-sm text-surface-muted px-1`}
      >
        {ridersShownLabel}
      </div>

      {sorted.length === 0 ? (
        <p className="text-surface-muted">
          {compareOnly && selectedRiderIds.length > 0
            ? "No selected riders are in the current course/class filter."
            : "No results match the current course and class selection."}
        </p>
      ) : (
        <div className="overflow-auto max-h-[calc(100vh-140px)] lg:max-h-[calc(100vh-220px)]">
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-surface-emphasis">
              <tr>
                <SortableHeader<SortKey>
                  label="Rider"
                  sortKey="position"
                  currentKey={sort.key}
                  currentDir={sort.dir}
                  onSort={onSort}
                  className="sticky left-0 bg-surface-emphasis z-20 min-w-[180px]"
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
                              <span className="block text-xs font-normal text-surface-muted">
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
                        className="min-w-[90px] border-l border-surface-border"
                      />
                      {splits.map((sp) => (
                        <SortableHeader<SortKey>
                          key={`split-${sp.split_segment_id}`}
                          label={
                            <span className="text-xs font-normal text-surface-muted">
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
                  className="min-w-[90px] border-l border-surface-border"
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

            <tbody className="divide-y divide-surface-border">
              {sorted.map((row) => (
                <tr
                  key={row.entry_id}
                  className="group hover:bg-surface-hover"
                >
                  <td className="px-3 py-2 align-top sticky left-0 bg-surface group-hover:bg-surface-hover z-10 min-w-[180px]">
                    <div className="flex items-baseline gap-2">
                      <span className="text-surface-muted tabular-nums text-xs w-6 shrink-0">
                        {row.is_dnf ? "—" : (row.position ?? "")}
                      </span>
                      <div className="leading-tight">
                        {row.person_id ? (
                          <Link
                          href={`/person/${row.person_id}`}
                            className="text-surface-foreground hover:underline"
                          >
                            {row.first_name} {row.last_name}
                          </Link>
                        ) : (
                          <span className="text-surface-foreground">
                            {row.first_name} {row.last_name}
                          </span>
                        )}
                        <div className="text-xs text-surface-muted">
                          {[row.course_name, row.class_name]
                            .filter(Boolean)
                            .join(" · ")}
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
                        <td className="px-4 py-2 text-right tabular-nums align-top min-w-[90px] border-l border-surface-border">
                          <div className="leading-tight">
                            <div className="text-surface-foreground">
                              {stage?.time_ms
                                ? formatTime(stage.time_ms)
                                : ""}
                            </div>
                            <div className="text-xs text-surface-muted">
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
                              className="px-3 py-2 text-right tabular-nums align-top min-w-[75px] bg-surface-hover"
                            >
                              <div className="leading-tight">
                                <div className="text-surface-foreground">
                                  {split?.time_ms
                                    ? formatTime(split.time_ms)
                                    : ""}
                                </div>
                                <div className="text-xs text-surface-muted">
                                  {splitPos ?? ""}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="px-4 py-2 text-right tabular-nums align-top min-w-[90px] border-l border-surface-border">
                    <div className="text-surface-foreground">
                      {row.is_dnf ? "DNF" : formatTime(row.total_time_ms)}
                    </div>
                    <div className="text-xs">&nbsp;</div>
                  </td>

                  <td className="px-4 py-2 text-right tabular-nums text-surface-muted align-top min-w-[90px]">
                    <div>
                      {row.is_dnf || row.time_back_ms == null
                        ? ""
                        : `+${formatTime(row.time_back_ms)}`}
                    </div>
                    <div className="text-xs">&nbsp;</div>
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