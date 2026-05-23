"use client"

/**
 * Sparkline — tiny axis-less Recharts line for in-table trends.
 *
 * Color is driven by direction by default (last vs first), or by the explicit
 * `positive` prop. Uses CSS vars from the Midday palette — no hex literals.
 *
 * Animation is OFF. Sparklines re-render frequently inside table rows; an
 * animated flash on every server-component refresh is visual noise.
 */

import { LineChart, Line } from "recharts"

type SparklineProps = {
  data: number[]
  width?: number
  height?: number
  /** Override the auto-detected direction. */
  positive?: boolean
}

export function Sparkline({ data, width = 80, height = 24, positive }: SparklineProps) {
  if (!data || data.length < 2) return <div style={{ width, height }} aria-hidden />
  const isPositive = positive ?? data[data.length - 1] > data[0]
  const color = isPositive ? "var(--positive)" : "var(--negative)"
  const series = data.map((v, i) => ({ i, v }))
  return (
    <LineChart
      width={width}
      height={height}
      data={series}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
    >
      <Line
        type="monotone"
        dataKey="v"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  )
}
