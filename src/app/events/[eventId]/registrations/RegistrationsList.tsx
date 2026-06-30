"use client";

import { useMemo, useState } from "react";
import type { RegistrationRow } from "./page";

type GroupedClass = {
  className: string;
  riders: RegistrationRow[];
};

type GroupedCourse = {
  courseName: string;
  classes: GroupedClass[];
  count: number;
};

function displayName(r: RegistrationRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed";
}

export function RegistrationsList({
  registrations,
}: {
  registrations: RegistrationRow[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => displayName(r).toLowerCase().includes(q));
  }, [registrations, query]);

  // Group: course → class → riders (alphabetical by last name)
  const grouped = useMemo<GroupedCourse[]>(() => {
    const byCourse = new Map<string, Map<string, RegistrationRow[]>>();
    for (const r of filtered) {
      const courseName = r.course || "Unassigned course";
      const className = r.class_name || "Unassigned class";
      if (!byCourse.has(courseName)) byCourse.set(courseName, new Map());
      const courseMap = byCourse.get(courseName)!;
      if (!courseMap.has(className)) courseMap.set(className, []);
      courseMap.get(className)!.push(r);
    }

    const courses: GroupedCourse[] = [];
    for (const [courseName, courseMap] of byCourse.entries()) {
      const classes: GroupedClass[] = [];
      let total = 0;
      for (const [className, riders] of courseMap.entries()) {
        const sortedRiders = [...riders].sort((a, b) => {
          const al = (a.last_name ?? "").localeCompare(b.last_name ?? "");
          if (al !== 0) return al;
          return (a.first_name ?? "").localeCompare(b.first_name ?? "");
        });
        classes.push({ className, riders: sortedRiders });
        total += sortedRiders.length;
      }
      classes.sort((a, b) => a.className.localeCompare(b.className));
      courses.push({ courseName, classes, count: total });
    }
    courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
    return courses;
  }, [filtered]);

  if (registrations.length === 0) {
    return (
      <p className="text-sm text-surface-muted">
        No registrations yet for this event.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <input
          type="search"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-surface-border-strong rounded px-3 py-2 text-sm bg-surface text-surface-foreground placeholder:text-surface-muted"
          autoFocus
        />
        <span className="text-sm text-surface-muted whitespace-nowrap">
          {filtered.length} of {registrations.length}
        </span>
      </div>

      {grouped.length === 0 ? (
        <p className="text-surface-muted text-sm">No matches.</p>
      ) : (
        grouped.map((course) => (
          <section key={course.courseName} className="mb-8 last:mb-0">
            <h2 className="text-lg font-semibold text-surface-foreground mb-3">
              {course.courseName}{" "}
              <span className="text-sm font-normal text-surface-muted">
                ({course.count})
              </span>
            </h2>

            {course.classes.map((cls) => (
              <div key={cls.className} className="mb-4 last:mb-0">
                <h3 className="text-sm font-semibold text-surface-muted uppercase tracking-wide mb-2">
                  {cls.className}{" "}
                  <span className="text-xs font-normal">
                    ({cls.riders.length})
                  </span>
                </h3>

                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                  {cls.riders.map((r) => (
                    <li
                      key={r.id}
                      className="text-sm text-surface-foreground"
                    >
                      {r.last_name ? (
                        <>
                          {r.last_name}
                          {r.first_name ? `, ${r.first_name}` : ""}
                        </>
                      ) : (
                        r.first_name || "Unnamed"
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}