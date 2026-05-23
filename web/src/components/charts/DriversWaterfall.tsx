"use client"

import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, CartesianGrid,
} from "recharts"
import type { components } from "@/lib/api.gen"
import { formatHl } from "@/lib/format"

type Driver = components["schemas"]["Driver"]

export function DriversWaterfall({ drivers }: { drivers: Driver[] }) {
  const data = drivers.map((d) => ({
    feature: d.feature.length > 22 ? d.feature.slice(0, 22) + "…" : d.feature,
    value: d.shap_value,
    direction: d.direction,
  }))

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
          />
          <YAxis
            type="category" dataKey="feature"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            width={140}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 6, fontSize: 12,
            }}
            formatter={(value) => [formatHl(Number(value)), "Contribution"]}
          />
          <ReferenceLine x={0} stroke="var(--foreground)" strokeWidth={1} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.direction === "positive" ? "var(--positive)" : "var(--negative)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
