/**
 * Baseline vs simulated forecast — overlaid lines on the same axes.
 */

import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"

type Series = { period: string; baseline: number; simulated: number }

export function SimulatorChart({ series, height = 280 }: { series: Series[]; height?: number }) {
  if (!series.length) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={series} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#e4e4e7" }}
          tickFormatter={v => formatPeriodShort(v)}
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))}
        />
        <Tooltip
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            fontSize: 12,
            color: "#09090b",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          formatter={(v: any) => formatHl(v as number)}
          labelFormatter={(v) => formatPeriodShort(v as string)}
        />
        <Line
          dataKey="baseline"
          type="monotone"
          stroke="#a1a1aa"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
          name="Baseline"
        />
        <Line
          dataKey="simulated"
          type="monotone"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: "#3b82f6", stroke: "#ffffff", strokeWidth: 2 }}
          isAnimationActive={false}
          name="Simulated"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
