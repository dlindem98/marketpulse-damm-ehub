"use client"

import {
  Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"

export function SimulatorChart({
  series,
}: {
  series: Array<{ period: string; baseline: number; simulated: number }>
}) {
  const data = series.map((d) => ({ ...d, period: formatPeriodShort(d.period) }))
  return (
    <div className="w-full h-[260px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 6, fontSize: 12,
            }}
            formatter={(value) => formatHl(Number(value))}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="line"
          />
          <Line
            type="monotone" dataKey="baseline" stroke="var(--muted-foreground)"
            strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Baseline"
          />
          <Line
            type="monotone" dataKey="simulated" stroke="var(--chart-1)"
            strokeWidth={2} dot={{ r: 2.5, fill: "var(--chart-1)" }} name="Simulated"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
