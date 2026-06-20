"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PersonResult } from "./page";

type Point = {
  date: string;
  percentile: number;
  eventName: string;
  course: string;
  klass: string;
};

export function PercentileChart({ results }: { results: PersonResult[] }) {
  // Build chart points: only events with a real finish + percentile,
  // sorted oldest to newest so the line reads left-to-right.
  const points: Point[] = results
    .filter(
      (r) =>
        !r.is_dnf &&
        r.percentile != null &&
        r.event_date != null,
    )
    .slice()
    .sort((a, b) =>
      (a.event_date ?? "").localeCompare(b.event_date ?? ""),
    )
    .map((r) => ({
      date: r.event_date!,
      // Display as 0–100 instead of 0–1; higher = better.
      percentile: Number(((r.percentile ?? 0) * 100).toFixed(1)),
      eventName: r.event_name ?? "",
      course: r.course_name ?? "",
      klass: r.class_name ?? "",
    }));

  if (points.length < 2) {
    return (
      <div className="mb-6 p-4 border border-gray-200 rounded text-sm text-gray-500">
        Need at least two finished results to show a percentile chart.
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="text-lg font-medium mb-2">Percentile over time</h2>
      <div style={{ height: 256, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              stroke="#9ca3af"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 12 }}
              stroke="#9ca3af"
              tickFormatter={(v) => `${v}%`}
            />
            <ReferenceLine y={50} stroke="#d1d5db" strokeDasharray="4 4" />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="percentile"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Custom tooltip so we can show event name + course/class,
 * not just the raw percentile number.
 */
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-3 py-2 text-xs">
      <div className="font-medium">{p.eventName}</div>
      <div className="text-gray-500">{p.date}</div>
      <div className="text-gray-500">
        {p.course}
        {p.klass ? ` · ${p.klass}` : ""}
      </div>
      <div className="mt-1">
        Percentile: <span className="tabular-nums">{p.percentile}%</span>
      </div>
    </div>
  );
}