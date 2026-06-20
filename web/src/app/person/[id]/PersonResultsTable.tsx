"use client";

import { formatTime } from "@/lib/format";
import type { PersonResult } from "./page";

export function PersonResultsTable({ results }: { results: PersonResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 sticky top-0">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Event</th>
            <th className="text-left px-3 py-2">Course</th>
            <th className="text-left px-3 py-2">Class</th>
            <th className="text-right px-3 py-2">Time</th>
            <th className="text-right px-3 py-2">Percentile</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr
              key={r.event_id}
              className="border-t border-gray-200 hover:bg-gray-50"
            >
              <td className="px-3 py-2 text-gray-600">{r.event_date ?? ""}</td>
              <td className="px-3 py-2">{r.event_name ?? ""}</td>
              <td className="px-3 py-2">{r.course_name ?? ""}</td>
              <td className="px-3 py-2">{r.class_name ?? ""}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.is_dnf ? "DNF" : formatTime(r.total_time_ms)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.percentile != null
                  ? `${r.percentile.toFixed(1)}%`
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}