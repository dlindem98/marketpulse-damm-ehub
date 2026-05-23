/**
 * Horizontal bar chart of forecast volume per sub-channel.
 * Bar color encodes gap-vs-target on a Dub-style diverging scale.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { formatHl, gapColor } from "@/lib/format"

type Row = { name: string; forecast: number; target: number; gap_pct: number }

export function GapByChannelChart({ rows, height = 260 }: { rows: Row[]; height?: number }) {
  if (!rows.length) return <div className="text-sm text-muted-foreground">No data.</div>

  const data = [...rows].sort((a, b) => b.forecast - a.forecast)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "#18181b", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={150}
        />
        <Tooltip
          cursor={{ fill: "#f4f4f5" }}
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            fontSize: 12,
            color: "#09090b",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          formatter={(value: any) => formatHl(value as number)}
        />
        <Bar dataKey="forecast" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={gapColor(d.gap_pct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
