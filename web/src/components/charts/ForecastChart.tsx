"use client"

/**
 * Forecast vs target — median line + dashed target.
 *
 * Why this design: a Commercial Manager looks at this for 5 seconds and needs
 * to answer "am I above or below target, and by how much". The Y axis is
 * sized to the forecast + target only (NOT the p10/p90 band) so those two
 * lines fill the plot area instead of being squashed by the model's
 * confidence range. Uncertainty is communicated by the BULLISH / Volatile
 * chip in the card header rather than an in-chart band.
 *
 * Annotations layer:
 *  - Promo windows render as soft green vertical bands behind the lines.
 *  - Calendar events render as dashed vertical reference lines.
 *  - Hover crosshair pins forecast + target values for the hovered period.
 */

import {
  ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts"
import type { TooltipProps } from "recharts"
import { formatHl, formatPeriod, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastPoint = components["schemas"]["ForecastPoint"]
type PromoWindow = components["schemas"]["PromoWindow"]
type CalendarEvent = components["schemas"]["CalendarEvent"]
type PeriodSignals = components["schemas"]["PeriodSignals"]

type ChartDatum = {
  period: string                       // X-axis label, e.g. "May '26"
  periodIso: string                    // ISO yyyy-mm-dd (used for tooltip lookup)
  point: number
  target: number | undefined
}

export function ForecastChart({
  points,
  targetByPeriod,
  promoWindows,
  events,
  signalsTimeline,
}: {
  points: ForecastPoint[]
  targetByPeriod?: Record<string, number>
  promoWindows?: PromoWindow[]
  events?: CalendarEvent[]
  /**
   * Per-month external context (weather, search, retail, events). When
   * supplied, the chart renders a labelled event-chip strip above the
   * line and the tooltip surfaces the active state (e.g. "+2.1° vs avg")
   * for the hovered period.
   */
  signalsTimeline?: PeriodSignals[]
}) {
  const data: ChartDatum[] = points.map((p) => ({
    period: formatPeriodShort(p.period),
    periodIso: p.period_start,
    point: p.point,
    target: targetByPeriod?.[p.period],
  }))

  // Map the chart's X-axis values (the short period label) to the ISO date
  // used by promo windows. ReferenceArea x1/x2 must reference values the
  // XAxis actually plots, so we translate ISO → short period.
  const isoToShort = new Map(data.map((d) => [d.periodIso, d.period]))

  // Filter to annotations that land inside the chart's visible range.
  const candidatePromos = (promoWindows ?? []).filter((w) =>
    monthsOverlap(w.period_start, w.period_end, data)
  )
  const visibleEvents = (events ?? []).filter((e) => isoToShort.has(e.period))

  // Per-month promo dedup. Estrella (and friends) can have 4-5 promo
  // windows overlapping the same month — multi-buy, two price variants,
  // a rollback — and rendering them all just stacks ReferenceAreas on
  // top of each other into an unreadable smear. Pick ONE per month:
  // priority by type (multibuy > price > display) then by window length.
  const TYPE_PRIORITY: Record<PromoWindow["type"], number> = {
    multibuy: 3,
    price: 2,
    display: 1,
  }
  function _promoScore(w: PromoWindow): number {
    const days = Math.max(
      1,
      Math.round((new Date(w.period_end).getTime() - new Date(w.period_start).getTime()) / 86_400_000),
    )
    return (TYPE_PRIORITY[w.type] ?? 0) * 1_000 + days
  }
  const promoByPeriod = new Map<string, PromoWindow>()
  for (const d of data) {
    const hits = candidatePromos.filter((w) =>
      withinPromoWindow(d.periodIso, w.period_start, w.period_end),
    )
    if (hits.length === 0) continue
    hits.sort((a, b) => _promoScore(b) - _promoScore(a))
    promoByPeriod.set(d.period, hits[0])
  }
  // `visiblePromos` becomes the unique set of winners across periods —
  // so each gets exactly one ReferenceArea instead of N overlapping ones.
  const visiblePromos = Array.from(new Set(promoByPeriod.values()))

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

  // Per-period signals (weather/search/retail/events). Keyed by the chart's
  // short period label so the tooltip can look up by hover label.
  const signalsByPeriod = new Map<string, PeriodSignals>()
  for (const s of signalsTimeline ?? []) {
    const short = isoToShort.get(s.period_start)
    if (short) signalsByPeriod.set(short, s)
  }

  // Pre-compute the events strip rendered above the chart — one chip per
  // visible event-bearing month, ordered chronologically. Shows the user at
  // a glance which months are touched by holidays / sport fixtures.
  const eventStrip = data
    .map((d) => ({
      period: d.period,
      events: eventsByPeriod.get(d.period) ?? [],
    }))
    .filter((row) => row.events.length > 0)

  // Y domain is sized to the FORECAST + TARGET only — the 80% confidence
  // band used to be included, which made the chart zoom out 3-4× and
  // squashed the median line into the bottom third. The band itself was
  // dropped from the rendered chart (engineer-detail; the BULLISH /
  // Volatile chip already communicates uncertainty at a glance) so this
  // is the honest scale of the data the user cares about.
  const allValues = data.flatMap((d) => {
    const out = [d.point]
    if (d.target != null) out.push(d.target)
    return out
  })
  const dataMin = allValues.length ? Math.min(...allValues) : 0
  const dataMax = allValues.length ? Math.max(...allValues) : 1
  const dataRange = Math.max(dataMax - dataMin, 1)
  const yMin = Math.max(0, dataMin - dataRange * 0.20)
  const yMax = dataMax + dataRange * 0.20

  return (
    <div className="w-full">
      {/* Events strip — labelled chips per affected month, scannable in one
          glance. Replaces the previous dashed-line-only annotation. The
          dashed reference lines still appear inside the chart for visual
          continuity, but they're now bound to a label up here. */}
      {eventStrip.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {eventStrip.map((row) => (
            <span
              key={row.period}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[10.5px] text-neutral-700"
              title={row.events.map((e) => `${e.label} (${row.period})`).join(" · ")}
            >
              <span className="text-neutral-400 tabular-nums">{row.period}</span>
              <span className="font-medium">
                {row.events.map((e) => e.label).join(" · ")}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="w-full h-[220px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
            domain={[yMin, yMax]}
          />
          <Tooltip
            cursor={{ stroke: "var(--neutral)", strokeDasharray: "2 3", strokeWidth: 1 }}
            content={
              <ForecastTooltip
                promoByPeriod={promoByPeriod}
                eventsByPeriod={eventsByPeriod}
                signalsByPeriod={signalsByPeriod}
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
  signalsByPeriod: Map<string, PeriodSignals>
}

function ForecastTooltip({
  active, payload, label, promoByPeriod, eventsByPeriod, signalsByPeriod,
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
  const signals = signalsByPeriod.get(String(label))

  // Build per-period external context lines. Only notable ones — skip
  // when the signal is "normal" so we don't fill the tooltip with noise.
  const externalLines: { icon: string; text: string; tone?: "good" | "bad" | "neutral" }[] = []
  if (signals) {
    const a = signals.weather.anomaly_c
    if (a != null && Math.abs(a) >= 0.5) {
      externalLines.push({
        icon: a > 0 ? "🌡" : "❄",
        text: `${a > 0 ? "+" : ""}${a.toFixed(1)}° vs avg`,
        tone: a > 0 ? "good" : "bad",
      })
    }
    if (signals.search.estrella_trend && signals.search.estrella_trend !== "flat") {
      externalLines.push({
        icon: "🔎",
        text: `Estrella search ${signals.search.estrella_trend}`,
        tone: signals.search.estrella_trend === "up" ? "good" : "bad",
      })
    }
    if (signals.retail.food_drink_trend && signals.retail.food_drink_trend !== "flat") {
      externalLines.push({
        icon: "🛒",
        text: `UK food & drink ${signals.retail.food_drink_trend}`,
        tone: signals.retail.food_drink_trend === "up" ? "good" : "bad",
      })
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-md px-3 py-2.5 text-[12px] min-w-[220px]">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1.5">
        {formatPeriod(datum.periodIso.slice(0, 7))}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-6 tabular-nums">
          <span className="text-neutral-500">Forecast</span>
          <span className="font-semibold text-neutral-900">{formatHl(forecast)}</span>
        </div>
        {target != null && (
          <div className="flex items-center justify-between gap-6 tabular-nums">
            <span className="text-neutral-500">Target</span>
            <span className="text-neutral-700">{formatHl(target)}</span>
          </div>
        )}
        {gapPct != null && (
          <div className="flex items-center justify-between gap-6 tabular-nums">
            <span className="text-neutral-500">Gap</span>
            <span
              className={
                gapPct >= 0.02 ? "font-semibold text-positive"
                : gapPct <= -0.02 ? "font-semibold text-negative"
                : "font-semibold text-neutral-900"
              }
            >
              {`${gapPct > 0 ? "+" : ""}${(gapPct * 100).toFixed(1)}%`}
            </span>
          </div>
        )}
      </div>

      {/* Period-specific context — promo / event / external state for THIS
          hovered point. Lets the user see *why* this month spikes or dips
          without leaving the chart. SKU-level SHAP drivers live in the
          right-rail "Why this forecast" card; repeating them in every
          tooltip hover was redundant. */}
      {(promo || events.length > 0 || externalLines.length > 0) && (
        <div className="mt-2 pt-2 border-t border-neutral-100 space-y-1">
          {promo && (
            <div className="text-[11.5px] text-[color:var(--positive)]">
              Promo: {promo.label}
            </div>
          )}
          {events.length > 0 && (
            <div className="text-[11.5px] text-neutral-700">
              {events.map((e) => e.label).join(" · ")}
            </div>
          )}
          {externalLines.map((l, i) => (
            <div
              key={i}
              className={`text-[11.5px] ${
                l.tone === "good"
                  ? "text-[color:var(--positive)]"
                  : l.tone === "bad"
                    ? "text-[color:var(--negative)]"
                    : "text-neutral-600"
              }`}
            >
              <span className="mr-1.5" aria-hidden>{l.icon}</span>
              {l.text}
            </div>
          ))}
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
