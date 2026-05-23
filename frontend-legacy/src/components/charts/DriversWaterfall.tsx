/**
 * SHAP-style horizontal bar chart, signed (green/red) and sorted by magnitude.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

type Driver = { feature: string; shap_value: number; direction: "positive" | "negative" }

export function DriversWaterfall({ drivers, height = 280 }: { drivers: Driver[]; height?: number }) {
  if (!drivers.length) return <div className="text-sm text-muted-foreground">No drivers.</div>
  const data = [...drivers].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))

  return (
    <ResponsiveContainer width="100%" height={Math.max(height, drivers.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 30, left: 0, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => `${v > 0 ? "+" : ""}${Math.round(v)}`}
        />
        <YAxis
          type="category"
          dataKey="feature"
          tick={{ fill: "#18181b", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={170}
        />
        <ReferenceLine x={0} stroke="#a1a1aa" />
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
          formatter={(v: any) => `${v > 0 ? "+" : ""}${Math.round(v as number)} Hl`}
        />
        <Bar dataKey="shap_value" radius={3} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.shap_value > 0 ? "#16a34a" : "#dc2626"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
