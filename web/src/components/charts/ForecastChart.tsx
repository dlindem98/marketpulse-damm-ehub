"use client"

/**
 * Forecast vs target — area band (p10/p90) + median line + dashed target.
 *
 * Why this design: a Commercial Manager looks at this for 5 seconds and needs
 * to answer "am I above or below target, and by how much". Median line + target
 * line + colored gap band does that without text.
 */

import {
  Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastPoint = components["schemas"]["ForecastPoint"]

export function ForecastChart({
  points,
  targetByPeriod,
}: {
  points: ForecastPoint[]
  targetByPeriod?: Record<string, number>
}) {
  const data = points.map((p) => ({
    period: formatPeriodShort(p.period),
    point: p.point,
    lo80: p.lo80,
    hi80: p.hi80,
    band: [p.lo80, p.hi80],
    target: targetByPeriod?.[p.period],
  }))

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 6, fontSize: 12,
            }}
            formatter={(value, name) => [formatHl(Number(value)), String(name)]}
          />
          {/* Confidence band */}
          <defs>
            <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey="band" stroke="none"
            fill="url(#bandFill)" name="80% band"
          />
          {/* Forecast median */}
          <Line
            type="monotone" dataKey="point" stroke="var(--chart-1)"
            strokeWidth={2} dot={{ r: 2.5, fill: "var(--chart-1)" }} name="Forecast"
          />
          {/* Target */}
          {targetByPeriod && (
            <Line
              type="monotone" dataKey="target" stroke="var(--muted-foreground)"
              strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Target"
            />
          )}
          <ReferenceLine y={0} stroke="var(--border)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
