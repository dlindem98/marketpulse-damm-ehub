/**
 * Dub-style monthly time-series with a confidence band.
 *
 * Color choices:
 *   - Forecast line: blue-500 (the neutral "primary metric" color in Dub)
 *   - Confidence band: blue-500 @ 14% alpha
 *   - Target line: gray-400 dashed
 *   - Tooltip: white card with gray-200 border, like Dub
 */

import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"

type Point = {
  period: string
  point: number
  lo80: number
  hi80: number
  target?: number | null
}

const COLORS = {
  primary: "#3b82f6",     // blue-500 — forecast line
  primaryFill: "#3b82f6", // for area fill, used with alpha
  target:  "#a1a1aa",     // zinc-400 — target dashed
  grid:    "#e4e4e7",     // zinc-200 — grid lines
  axis:    "#71717a",     // zinc-500 — axis labels
}

export function ForecastAreaChart({ points, height = 320 }: { points: Point[]; height?: number }) {
  if (!points.length) return <div className="text-sm text-muted-foreground">No data.</div>

  const data = points.map(p => ({
    period: p.period,
    p50: p.point,
    p10: p.lo80,
    p90: p.hi80,
    target: p.target ?? null,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 18, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={COLORS.primary} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ fill: COLORS.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: COLORS.grid }}
          tickFormatter={v => formatPeriodShort(v)}
        />
        <YAxis
          tick={{ fill: COLORS.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))}
        />
        <Tooltip
          cursor={{ stroke: COLORS.axis, strokeDasharray: "3 3" }}
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            fontSize: 12,
            color: "#09090b",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          labelStyle={{ color: "#71717a", marginBottom: 4, fontWeight: 500 }}
          formatter={(value: any, name: any) => {
            if (value === null || value === undefined) return ["—", String(name ?? "")]
            return [formatHl(value as number), String(name ?? "")]
          }}
          labelFormatter={v => formatPeriodShort(v as string)}
        />

        <Area
          dataKey="p90"
          stroke="none"
          fill="url(#forecastBand)"
          isAnimationActive={false}
          name="80% upper"
        />
        <Area
          dataKey="p10"
          stroke="none"
          fill="#ffffff"
          fillOpacity={1}
          isAnimationActive={false}
          name="80% lower"
        />

        <Line
          dataKey="p50"
          type="monotone"
          stroke={COLORS.primary}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: COLORS.primary, stroke: "#ffffff", strokeWidth: 2 }}
          isAnimationActive={false}
          name="Forecast"
        />
        <Line
          dataKey="target"
          type="monotone"
          stroke={COLORS.target}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
          name="Target"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
