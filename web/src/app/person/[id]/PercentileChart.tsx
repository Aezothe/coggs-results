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
  const points: Point[] = results
    .filter(
      (r) =>
        !r.is_dnf && r.percentile != null && r.event_date != null,
    )
    .slice()
    .sort((a, b) =>
      (a.event_date ?? "").localeCompare(b.event_date ?? ""),
    )
    .map((r) => ({
      date: r.event_date!,
      percentile: Number(((r.percentile ?? 0) * 100).toFixed(1)),
      eventName: r.event_name ?? "",
      course: r.course_name ?? "",
      klass: r.class_name ?? "",
    }));

  if (points.length < 2) {
    return (
      <div
        className="mb-6 p-4 border rounded text-sm"
        style={{
          borderColor: "var(--color-border-on-light)",
          color: "var(--color-text-on-light-muted)",
        }}
      >
        Need at least two finished results to show a percentile chart.
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2
        className="text-lg font-medium mb-2"
        style={{ color: "var(--color-text-on-light)" }}
      >
        Percentile over time
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart
            data={points}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-on-light)"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              stroke="var(--color-text-on-light-muted)"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 12 }}
              stroke="var(--color-text-on-light-muted)"
              tickFormatter={(v) => `${v}%`}
            />
            <ReferenceLine
              y={50}
              stroke="var(--color-border-on-light-strong)"
              strokeDasharray="4 4"
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="percentile"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--color-primary)" }}
              activeDot={{ r: 6, fill: "var(--color-primary)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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
    <div
      className="rounded shadow-sm px-3 py-2 text-xs border"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border-on-light)",
        color: "var(--color-text-on-light)",
      }}
    >
      <div className="font-medium">{p.eventName}</div>
      <div style={{ color: "var(--color-text-on-light-muted)" }}>{p.date}</div>
      <div style={{ color: "var(--color-text-on-light-muted)" }}>
        {p.course}
        {p.klass ? ` · ${p.klass}` : ""}
      </div>
      <div className="mt-1">
        Percentile: <span className="tabular-nums">{p.percentile}%</span>
      </div>
    </div>
  );
}