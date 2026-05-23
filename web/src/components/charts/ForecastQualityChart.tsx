"use client"

/**
 * Two-line chart: solid actuals (chart-1) + dashed back-tested predictions
 * (chart-2). Custom tooltip shows both values + signed error %. Styled to
 * match ForecastChart.tsx — same grid, axis, font conventions.
 */

import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type QualityPoint = components["schemas"]["QualityPoint"]

type Row = {
  period: string
  actual: number
  predicted: number
  error_pct: number
}

export function ForecastQualityChart({ points }: { points: QualityPoint[] }) {
  const data: Row[] = points.map((p) => ({
    period: formatPeriodShort(p.period),
    actual: p.actual_hl,
    predicted: p.predicted_hl,
    error_pct: p.error_pct,
  }))

  return (
    <div className="w-full h-[260px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={<QualityTooltip />}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--chart-1)" }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            name="Predicted"
            stroke="var(--chart-2)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function QualityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const errSigned = row.error_pct
  const errPct = (Math.abs(errSigned) * 100).toFixed(1)
  // (actual - predicted) / actual: positive = model under-predicted; negative = over-predicted.
  const tone =
    Math.abs(errSigned) <= 0.10
      ? "var(--positive)"
      : Math.abs(errSigned) > 0.20
        ? "var(--warn)"
        : "var(--muted-foreground)"
  return (
    <div
      className="rounded-md border bg-card text-card-foreground shadow-sm"
      style={{ borderColor: "var(--border)", padding: "8px 10px", fontSize: 12 }}
    >
      <div className="text-[11px] text-neutral-500 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-4 tabular-nums">
        <span className="text-neutral-600">Actual</span>
        <span className="font-medium text-neutral-900">{formatHl(row.actual)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 tabular-nums">
        <span className="text-neutral-600">Predicted</span>
        <span className="font-medium text-neutral-900">{formatHl(row.predicted)}</span>
      </div>
      <div
        className="flex items-center justify-between gap-4 tabular-nums mt-1 pt-1 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-neutral-600">Error</span>
        <span className="font-medium" style={{ color: tone }}>
          {errSigned > 0 ? "+" : errSigned < 0 ? "−" : ""}
          {errPct}%
        </span>
      </div>
    </div>
  )
}
