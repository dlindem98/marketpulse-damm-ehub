"use client"

/**
 * Forecast vs target — area band (p10/p90) + median line + dashed target.
 *
 * Why this design: a Commercial Manager looks at this for 5 seconds and needs
 * to answer "am I above or below target, and by how much". Median line + target
 * line + colored gap band does that without text.
 *
 * Annotations layer (added in Plan B):
 *  - Promo windows render as soft green vertical bands ("3 for £10" etc.)
 *    behind the lines so the user sees *why* a past month over/underperformed.
 *  - Calendar events (bank holidays, Wimbledon, Euros) render as dashed
 *    vertical reference lines with a small top label.
 *  - Hover crosshair pins forecast + target values for the hovered period
 *    and surfaces any in-band promo label in the tooltip card.
 */

import {
  Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts"
import type { TooltipProps } from "recharts"
import { formatHl, formatPeriod, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastPoint = components["schemas"]["ForecastPoint"]
type PromoWindow = components["schemas"]["PromoWindow"]
type CalendarEvent = components["schemas"]["CalendarEvent"]

type ChartDatum = {
  period: string                       // X-axis label, e.g. "May '26"
  periodIso: string                    // ISO yyyy-mm-dd (used for tooltip lookup)
  point: number
  lo80: number
  hi80: number
  band: [number, number]
  target: number | undefined
}

export function ForecastChart({
  points,
  targetByPeriod,
  promoWindows,
  events,
}: {
  points: ForecastPoint[]
  targetByPeriod?: Record<string, number>
  promoWindows?: PromoWindow[]
  events?: CalendarEvent[]
}) {
  const data: ChartDatum[] = points.map((p) => ({
    period: formatPeriodShort(p.period),
    periodIso: p.period_start,
    point: p.point,
    lo80: p.lo80,
    hi80: p.hi80,
    band: [p.lo80, p.hi80],
    target: targetByPeriod?.[p.period],
  }))

  // Map the chart's X-axis values (the short period label) to the ISO date
  // used by promo windows. ReferenceArea x1/x2 must reference values the
  // XAxis actually plots, so we translate ISO → short period.
  const isoToShort = new Map(data.map((d) => [d.periodIso, d.period]))

  // Filter to annotations that land inside the chart's visible range.
  const visiblePromos = (promoWindows ?? []).filter((w) =>
    monthsOverlap(w.period_start, w.period_end, data)
  )
  const visibleEvents = (events ?? []).filter((e) => isoToShort.has(e.period))

  // Map each datum's period to any promo it sits inside. Used by the tooltip.
  const promoByPeriod = new Map<string, PromoWindow>()
  for (const d of data) {
    const hit = (promoWindows ?? []).find((w) =>
      withinPromoWindow(d.periodIso, w.period_start, w.period_end)
    )
    if (hit) promoByPeriod.set(d.period, hit)
  }

  // Same trick for calendar events — surface in tooltip rather than as
  // labels on the chart, which collide when events cluster (Christmas/Boxing/NYE).
  const eventsByPeriod = new Map<string, CalendarEvent[]>()
  for (const e of visibleEvents) {
    const short = isoToShort.get(e.period)
    if (!short) continue
    const arr = eventsByPeriod.get(short) ?? []
    arr.push(e)
    eventsByPeriod.set(short, arr)
  }

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--neutral)", strokeDasharray: "2 3", strokeWidth: 1 }}
            content={
              <ForecastTooltip
                promoByPeriod={promoByPeriod}
                eventsByPeriod={eventsByPeriod}
              />
            }
          />

          {/* Promo bands first so they paint *underneath* lines + band */}
          {visiblePromos.map((w, i) => {
            const x1 = nearestVisiblePeriod(w.period_start, data, "start")
            const x2 = nearestVisiblePeriod(w.period_end, data, "end")
            if (!x1 || !x2) return null
            return (
              <ReferenceArea
                key={`promo-${i}`}
                x1={x1}
                x2={x2}
                fill="var(--positive-soft)"
                fillOpacity={0.55}
                stroke="none"
                label={{
                  value: w.label,
                  position: "insideTop",
                  fontSize: 10,
                  fill: "var(--positive)",
                }}
              />
            )
          })}

          {/* Calendar events — quiet vertical markers, names live in the tooltip
              (clustered events would otherwise overlap each other). */}
          {visibleEvents.map((e, i) => {
            const x = isoToShort.get(e.period)
            if (!x) return null
            return (
              <ReferenceLine
                key={`event-${i}`}
                x={x}
                stroke="var(--border)"
                strokeDasharray="2 3"
              />
            )
          })}

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

// ──────────────────────────────────────────────────────────────────────────
// Tooltip
// ──────────────────────────────────────────────────────────────────────────

type TooltipDatum = ChartDatum & { target?: number }

type ForecastTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: TooltipDatum }>
  label?: string
  promoByPeriod: Map<string, PromoWindow>
  eventsByPeriod: Map<string, CalendarEvent[]>
}

function ForecastTooltip({
  active, payload, label, promoByPeriod, eventsByPeriod,
}: ForecastTooltipProps) {
  if (!active || !payload?.length) return null
  // recharts may stack multiple payload entries (band, point, target) — first
  // entry whose payload is a ChartDatum is enough.
  const datum = payload[0]?.payload as TooltipDatum | undefined
  if (!datum) return null

  const forecast = datum.point
  const target = datum.target
  const gapPct = target ? (forecast - target) / target : null
  const promo = promoByPeriod.get(String(label))
  const events = eventsByPeriod.get(String(label)) ?? []

  return (
    <div className="bg-white border border-neutral-200 rounded-md shadow-sm px-3 py-2 text-[12px]">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
        {formatPeriod(datum.periodIso.slice(0, 7))}
      </div>
      <div className="flex items-center justify-between gap-6 tabular-nums">
        <span className="text-neutral-500">Forecast</span>
        <span className="font-medium text-neutral-900">{formatHl(forecast)}</span>
      </div>
      {target != null && (
        <div className="flex items-center justify-between gap-6 tabular-nums">
          <span className="text-neutral-500">Target</span>
          <span className="font-medium text-neutral-900">{formatHl(target)}</span>
        </div>
      )}
      {gapPct != null && (
        <div className="flex items-center justify-between gap-6 tabular-nums">
          <span className="text-neutral-500">Gap</span>
          <span
            className={
              gapPct >= 0.02 ? "font-medium text-positive"
              : gapPct <= -0.02 ? "font-medium text-negative"
              : "font-medium text-neutral-900"
            }
          >
            {`${gapPct > 0 ? "+" : ""}${(gapPct * 100).toFixed(1)}%`}
          </span>
        </div>
      )}
      {promo && (
        <div className="mt-1.5 pt-1.5 border-t border-neutral-100 text-positive tabular-nums">
          Promo: {promo.label}
        </div>
      )}
      {events.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-neutral-100 text-neutral-600">
          {events.map((e) => e.label).join(" · ")}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Period-window helpers
// ──────────────────────────────────────────────────────────────────────────

/** Whether `period` (ISO date of a month-start) falls inside [start, end]. */
function withinPromoWindow(periodIso: string, start: string, end: string): boolean {
  // promo windows are week-aligned but the chart is monthly. A monthly point
  // is "inside" the window if any day of that month falls in [start, end].
  if (!periodIso) return false
  const [py, pm] = periodIso.split("-").map((n) => parseInt(n, 10))
  if (!py || !pm) return false
  const monthStart = new Date(py, pm - 1, 1)
  const monthEnd = new Date(py, pm, 0)  // last day of month
  const s = new Date(start)
  const e = new Date(end)
  return monthEnd >= s && monthStart <= e
}

/** True if any visible month overlaps the promo window. */
function monthsOverlap(
  start: string, end: string, data: ChartDatum[],
): boolean {
  return data.some((d) => withinPromoWindow(d.periodIso, start, end))
}

/**
 * Snap a promo window edge to the nearest *visible* month label on the chart.
 * Recharts ReferenceArea needs x1/x2 to match category-axis values, so we
 * translate an arbitrary ISO date to the nearest month bucket present in
 * the chart data.
 */
function nearestVisiblePeriod(
  iso: string,
  data: ChartDatum[],
  edge: "start" | "end",
): string | null {
  if (!data.length) return null
  const t = new Date(iso).getTime()
  let best: ChartDatum = data[0]
  let bestDelta = Infinity
  for (const d of data) {
    const dt = new Date(d.periodIso).getTime()
    const delta = Math.abs(dt - t)
    if (delta < bestDelta) {
      bestDelta = delta
      best = d
    }
  }
  // Clamp to range so a window starting before the chart pins to the first
  // visible month rather than disappearing.
  const firstTs = new Date(data[0].periodIso).getTime()
  const lastTs = new Date(data[data.length - 1].periodIso).getTime()
  if (edge === "start" && t < firstTs) return data[0].period
  if (edge === "end" && t > lastTs) return data[data.length - 1].period
  return best.period
}
