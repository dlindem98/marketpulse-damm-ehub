/**
 * Overview — narrative-led decision view, Midday-inspired.
 *
 * Layout:
 *   [ KPI strip: Gap · Forecast · Target · Confidence            ]
 *   [ Focused forecast chart (target ± 2 months) | Top drivers   ]
 *   [ Recommended action CTA (balanced scenario from /recommend) ]
 *
 * The forecast endpoint accepts granularity=week but the underlying parquet
 * is monthly (see backend/app/data/snapshots/). When real weekly data lands
 * we can flip the default + add a toggle here without restructuring the page.
 */

import Link from "next/link"
import { ArrowRight, History, CalendarClock, Target } from "lucide-react"
import { ForecastChart } from "@/components/charts/ForecastChart"
import { serverFetch } from "@/lib/api"
import { driverHint, driverLabel } from "@/lib/driver-labels"
import { confidenceLabel, formatHl, formatPercent } from "@/lib/format"
import type { components } from "@/lib/api.gen"
import { GranularityToggle } from "./granularity-toggle"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type ForecastPoint = components["schemas"]["ForecastPoint"]
type Driver = components["schemas"]["Driver"]
type ExplainView = components["schemas"]["ExplainViewSummary"]
type ExternalSignalsTimelineT = components["schemas"]["ExternalSignalsTimeline"]
type GapItem = components["schemas"]["GapItem"]
type PlaysResponse = components["schemas"]["PlaysResponse"]
type Play = components["schemas"]["Play"]

const CONFIDENCE_CHIP: Record<string, string> = {
  high:   "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
  medium: "bg-neutral-100 text-neutral-600",
  low:    "bg-[color:var(--negative-soft)] text-[color:var(--negative)]",
}

// Per-kind visual + grouping copy. The kind is the *type of bet* the
// user is choosing — Repeat what worked / Catch an event / Close the gap —
// not a risk-level abstraction.
const PLAY_META: Record<
  Play["kind"],
  { eyebrow: string; icon: typeof History; iconClass: string; isPrimary?: boolean }
> = {
  repeat: {
    eyebrow: "Repeat what worked",
    icon: History,
    iconClass: "text-neutral-600 bg-neutral-100",
  },
  event: {
    eyebrow: "Catch an event",
    icon: CalendarClock,
    iconClass: "text-[color:var(--positive)] bg-[color:var(--positive-soft)]",
  },
  "gap-closer": {
    eyebrow: "Close the gap",
    icon: Target,
    iconClass: "text-white bg-neutral-900",
    isPrimary: true,
  },
}

export async function DiagnosisPanel({
  sku, sub_channel, currentGap, targetPeriod, granularity,
}: {
  sku: string
  sub_channel: string
  currentGap: GapItem | null
  targetPeriod: string | undefined
  granularity: "month" | "week"
}) {
  const baseQ = `?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`
  const fcQ = `${baseQ}&granularity=${granularity}`

  const [forecast, drivers, plays, signalsTimeline, targets] = await Promise.all([
    serverFetch<ForecastSeries>(`/api/forecast${fcQ}`),
    serverFetch<Driver[]>(`/api/drivers${baseQ}`),
    // Three signal-grounded plays for this SKU × channel × target month.
    // Each play is anchored on a different data source (historical promo
    // ROI / upcoming events / forecast-vs-target) so the user is choosing
    // a *type of bet* rather than a generic risk dial.
    serverFetch<PlaysResponse>(
      `/api/plays${baseQ}${targetPeriod ? `&period=${encodeURIComponent(targetPeriod)}` : ""}`,
    ).catch(() => null),
    // Per-month signals across the chart window — drives the event-chip
    // strip above the chart and the per-period state in the tooltip.
    serverFetch<ExternalSignalsTimelineT>(`/api/external-signals/timeline${baseQ}`)
      .catch(() => null),
    // Full target series for this SKU × channel — every month we have a
    // target row for, not just at-risk ones (/api/gap filters those out
    // and would leave the chart's target line fragmented).
    serverFetch<Array<{ period: string; target_hl: number }>>(`/api/targets${baseQ}`)
      .catch(() => [] as Array<{ period: string; target_hl: number }>),
  ])

  // Monthly: ±4 months around target. Weekly: ~12 weeks centred on target.
  // Both keep the chart populated without dragging the full horizon in.
  const radius = granularity === "month" ? 4 : 6
  const focused = focusAroundTarget(forecast.points ?? [], targetPeriod, radius, granularity)

  const totalForecastHl = focused.reduce((s, p) => s + p.point, 0)
  const topDrivers = drivers.slice(0, 5).map((d) => ({
    feature: driverLabel(d.feature),
    raw_feature: d.feature,
    direction: d.direction,
    shap_value: Math.round(d.shap_value),
  }))

  const narrativeRaw = await serverFetch<ExplainView>("/api/explain-view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      page: "drivers",
      filters: { sku, sub_channel },
      visible_state: {
        sku,
        sub_channel,
        horizon_months: focused.length,
        forecast_total_hl: Math.round(totalForecastHl),
        forecast_points: focused.slice(0, 6).map((p) => ({
          period: p.period,
          point_hl: Math.round(p.point),
          lo80_hl: Math.round(p.lo80),
          hi80_hl: Math.round(p.hi80),
        })),
        top_drivers: topDrivers,
      },
    }),
  }).catch(() => null)

  const isFallback =
    !!narrativeRaw &&
    (narrativeRaw.headline?.startsWith("Summary of") ||
      narrativeRaw.bullets?.[0]?.startsWith("Unable to generate"))
  const narrative = isFallback ? null : narrativeRaw

  // Order the plays so the gap-closer (the primary recommendation) sits
  // in the middle visually, with Repeat on the left (safest, grounded in
  // history) and Catch-an-event on the right (forward-looking).
  const PLAY_ORDER: Play["kind"][] = ["repeat", "gap-closer", "event"]
  const playsOrdered = plays?.plays
    ? PLAY_ORDER.map((kind) => plays.plays.find((p) => p.kind === kind)).filter(
        (p): p is Play => !!p,
      )
    : []

  return (
    <div className="flex flex-col gap-3 min-h-[calc(100vh-160px)]">
      {/* Narrative — quiet headline above the chart. Hidden on LLM fallback. */}
      {narrative && (
        <section>
          <h2 className="font-serif text-[22px] leading-[1.2] tracking-[-0.01em] text-neutral-900">
            {narrative.headline}
          </h2>
        </section>
      )}

      {/* Chart — full width. No sidebar, no stretched columns, no empty
          pockets. Pattern lifted from Stripe / Vercel Analytics: hero chart
          spans the page, supporting cards live in their own row below. */}
      <section className="rounded-2xl border border-neutral-200 bg-white">
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h3 className="text-[13px] font-semibold text-neutral-900">Forecast vs target</h3>
          <div className="flex items-center gap-2 shrink-0">
            {currentGap && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${
                  CONFIDENCE_CHIP[currentGap.confidence]
                }`}
              >
                {confidenceLabel(currentGap.confidence)}
              </span>
            )}
            <GranularityToggle value={granularity} />
          </div>
        </header>
        <div className="px-3 pb-3 pt-1">
          <ForecastChart
            points={focused}
            // Use the full target series, not the at-risk-only gap rows —
            // /api/gap drops months where this SKU is on plan, which would
            // leave the target line fragmented.
            targetByPeriod={Object.fromEntries(
              targets.map((t) => [t.period, t.target_hl]),
            )}
            promoWindows={forecast.promo_windows ?? []}
            events={forecast.events ?? []}
            signalsTimeline={signalsTimeline?.months ?? []}
          />
          {/* Inline legend — written in business language so a Commercial
              Manager doesn't have to know what "80% confidence band" means
              (it's the model's likely range, but the label hides the
              jargon; full definition lives in the title tooltip). */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-neutral-500">
            <span
              className="inline-flex items-center gap-1.5"
              title="The model's single best-guess number for each month."
            >
              <span className="inline-block h-[2px] w-4 bg-[var(--chart-1)]" />
              Forecast
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              title="The budget for this SKU × channel for each month, what we're aiming for."
            >
              <span
                className="inline-block h-[1px] w-4 border-t border-dashed"
                style={{ borderColor: "var(--muted-foreground)" }}
              />
              Target
            </span>
          </div>
        </div>
        {/* External "context" line removed — the same numbers (weather /
            search trend / events) now live in the per-period chart tooltip,
            where they're tied to the specific month the user is asking
            about. A bare data line at the bottom wasn't actionable. */}
        {narrative && narrative.bullets?.length > 0 && (
          <div className="border-t border-neutral-200 px-5 py-3 text-[12.5px] text-neutral-600">
            {narrative.bullets[0]}
          </div>
        )}
      </section>

      {/* Supporting context row — Recent performance, Planned promos, Top
          drivers. Three equal-height columns (cards stretch to the tallest
          in the row); if any one is missing, the others widen to fit. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {currentGap && currentGap.history_hl && currentGap.history_hl.length > 0 && (
          <RecentPerformanceCard history={currentGap.history_hl} />
        )}

        <PromosInPeriodCard
          windows={forecast.promo_windows ?? []}
          targetPeriod={targetPeriod}
        />

        <section className="h-full rounded-2xl border border-neutral-200 bg-white">
          <header className="px-4 pt-3 pb-2">
            <h3 className="text-[13px] font-semibold text-neutral-900">
              Why this forecast
            </h3>
          </header>
          <div className="px-4 pb-3 space-y-2">
            {drivers.slice(0, 3).map((d, i) => {
              const isUp = d.direction === "positive"
              const contribution = formatHl(Math.abs(d.shap_value))
              const hint = driverHint(d.feature)
              return (
                <div
                  key={i}
                  className="flex items-center gap-3"
                  // Hover-tooltip explanation per driver — keeps the row
                  // compact while still letting curious users read the
                  // business-language hint.
                  title={hint}
                >
                  <div
                    className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${
                      isUp
                        ? "bg-[var(--positive)]/10 text-[var(--positive)]"
                        : "bg-[var(--negative)]/10 text-[var(--negative)]"
                    }`}
                    aria-label={isUp ? "Positive driver" : "Negative driver"}
                  >
                    {isUp ? "↑" : "↓"}
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-neutral-900 truncate">
                      {driverLabel(d.feature)}
                    </span>
                    <span
                      className={`text-[11.5px] tabular-nums shrink-0 ${
                        isUp ? "text-[var(--positive)]" : "text-[var(--negative)]"
                      }`}
                    >
                      {isUp ? "+" : "−"}{contribution}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Three plays the LLM proposed. Each card → Simulator prefilled with
          that scenario's months/promo. `flex-1` on the section makes this
          row absorb the remaining viewport height, and `h-full` on each
          card stretches the surfaces with it — so the page fits without
          scrolling and the actions get the prominence they deserve. */}
      {playsOrdered.length > 0 && (
        <section className="flex-1 flex flex-col min-h-[180px]">
          <header className="mb-3">
            <h3 className="text-[13px] font-semibold text-neutral-900">
              Pick a play
            </h3>
          </header>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
            {playsOrdered.map((p) => (
              <PlayCard
                key={p.kind}
                play={p}
                href={simulateHrefForPlay(sku, sub_channel, targetPeriod, p)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * A single signal-grounded play. The eyebrow + icon name the type of bet
 * the user is choosing; the title is the concrete action; the "why" line
 * cites the actual data source that surfaced it. Hovering shows the full
 * grounding sentence; clicking through pre-fills the simulator with the
 * play's months / promo / discount / effort.
 */
function PlayCard({ play, href }: { play: Play; href: string }) {
  const meta = PLAY_META[play.kind]
  const Icon = meta.icon
  const closurePct = play.expected_gap_closed_pct ?? 0
  const closureColor = closurePct > 0 ? "text-[var(--positive)]" : "text-neutral-700"

  return (
    <Link
      href={href as Parameters<typeof Link>[0]["href"]}
      className={`group flex h-full flex-col gap-2.5 rounded-xl border bg-white px-4 py-3.5 transition-all hover:border-neutral-400 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        meta.isPrimary ? "border-neutral-900" : "border-neutral-200"
      }`}
    >
      {/* Eyebrow + gap-closed badge. The eyebrow itself names the kind of
          play (REPEAT / CLOSE THE GAP / CATCH AN EVENT) so the body below
          doesn't need to repeat the source. */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${meta.iconClass}`}
          aria-hidden
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          {meta.eyebrow}
        </span>
        {play.expected_gap_closed_pct != null && (
          <span
            className={`ml-auto text-[12px] font-semibold tabular-nums ${closureColor}`}
            title="Estimated share of the current month's gap this play would close"
          >
            {formatPercent(closurePct, 0)}
          </span>
        )}
      </div>

      {/* Concrete action — what the user would do. */}
      <div className="text-[13.5px] font-semibold text-neutral-900 leading-snug">
        {play.title}
      </div>

      {/* One-liner grounding — full sentence lives in the hover title so
          the card stays compact while the curious user can dig in. */}
      <p
        className="mt-auto text-[11.5px] text-neutral-500 leading-snug line-clamp-2"
        title={play.why}
      >
        {play.why}
      </p>

      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
        <span>
          {(play.months ?? []).length > 0
            ? (play.months ?? []).length === 1
              ? (play.months ?? [])[0]
              : `${(play.months ?? []).length} months`
            : "—"}
        </span>
        <ArrowRight className="h-3.5 w-3.5 group-hover:text-neutral-700 transition-colors" />
      </div>
    </Link>
  )
}

/**
 * Build the Simulator URL with prefill params from a Play. The simulator
 * panel reads `months`, `discount`, `promo` (and accepts `effort` /
 * `action_type` via its own state) from the query string.
 */
function simulateHrefForPlay(
  sku: string,
  sub_channel: string,
  fallbackPeriod: string | undefined,
  play: Play,
): string {
  const period = (play.months ?? [])[0] ?? fallbackPeriod
  const base =
    `/decision/${encodeURIComponent(sku)}/${encodeURIComponent(sub_channel)}` +
    `?tab=simulate` +
    (period ? `&period=${encodeURIComponent(period)}` : "")
  const parts = [base]
  if ((play.months ?? []).length > 0) {
    parts.push(`months=${encodeURIComponent((play.months ?? []).join(","))}`)
  }
  if (play.action_type) {
    parts.push(`action=${encodeURIComponent(play.action_type)}`)
  }
  if (play.promo_type) {
    parts.push(`promo=${encodeURIComponent(play.promo_type)}`)
  }
  if (play.discount_pct != null) {
    parts.push(`discount=${play.discount_pct}`)
  }
  if (play.effort_level) {
    parts.push(`effort=${encodeURIComponent(play.effort_level)}`)
  }
  return parts.join("&")
}

/**
 * Recent performance — last N months of gap_hl rendered as a tiny bar row.
 * Bars above zero = beat target, below = missed. Quick visual answer to
 * "is this SKU a repeat under-performer or a one-off?".
 */
function RecentPerformanceCard({ history }: { history: number[] }) {
  const last = history.slice(-6)
  if (last.length === 0) return null
  const peak = Math.max(...last.map((v) => Math.abs(v)), 1)
  const beats = last.filter((v) => v >= 0).length
  const misses = last.length - beats

  return (
    <section className="h-full rounded-2xl border border-neutral-200 bg-white">
      <header className="px-4 pt-3 pb-2">
        <h3 className="text-[13px] font-semibold text-neutral-900">Recent performance</h3>
        <p className="text-[12px] text-neutral-500 mt-0.5 tabular-nums">
          Last {last.length} months · {beats} beat / {misses} missed target
        </p>
      </header>
      <div className="px-4 pb-3">
        {/* Centered baseline: positive months grow up from the middle,
            negative months grow down. Zero line sits at the mid-height
            so the direction reads immediately. */}
        <div className="relative h-[56px]">
          <div className="absolute inset-x-0 top-1/2 h-px bg-neutral-200" />
          <div className="absolute inset-0 flex gap-1.5">
            {last.map((v, i) => {
              const pct = Math.abs(v) / peak
              // Each bar can take up to ~95% of its half (top or bottom).
              const heightPct = Math.max(6, pct * 95)
              const isPositive = v >= 0
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col h-full"
                  title={`${formatHl(v)} vs target`}
                >
                  {/* Top half — only renders the bar when positive. */}
                  <div className="flex-1 flex flex-col justify-end">
                    {isPositive && (
                      <div
                        className="rounded-t-sm"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: "var(--positive)",
                          opacity: 0.9,
                        }}
                      />
                    )}
                  </div>
                  {/* Bottom half — only renders the bar when negative. */}
                  <div className="flex-1 flex flex-col">
                    {!isPositive && (
                      <div
                        className="rounded-b-sm"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: "var(--negative)",
                          opacity: 0.9,
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-neutral-400 tabular-nums">
          <span>{last.length}mo ago</span>
          <span>now</span>
        </div>
      </div>
    </section>
  )
}

type PromoWindow = components["schemas"]["PromoWindow"]

/**
 * Promos in this period — surfaces any planned trade activity that
 * overlaps the chart window. Sourced from the same /api/forecast call
 * that drives the chart's promo bands, just rendered as a readable list.
 */
function PromosInPeriodCard({
  windows,
  targetPeriod,
}: {
  windows: PromoWindow[]
  targetPeriod: string | undefined
}) {
  const sorted = [...windows].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  )
  const top = sorted.slice(0, 3)
  const isEmpty = sorted.length === 0
  return (
    <section className="h-full rounded-2xl border border-neutral-200 bg-white">
      <header className="px-4 pt-3 pb-2">
        <h3 className="text-[13px] font-semibold text-neutral-900">Planned promos</h3>
        <p className="text-[12px] text-neutral-500 mt-0.5">
          {isEmpty
            ? `No trade activity planned${targetPeriod ? ` around ${humanPeriod(targetPeriod)}` : ""}.`
            : `Trade activity in the chart window${targetPeriod ? ` around ${humanPeriod(targetPeriod)}` : ""}.`}
        </p>
      </header>
      {isEmpty ? (
        <div className="px-4 pb-3 text-[12px] text-neutral-500 leading-relaxed">
          Nothing in the trade plan touches this SKU and channel right now —
          a play here would be a fresh decision rather than a tweak to an
          existing promo.
        </div>
      ) : (
        <ul className="px-4 pb-3 space-y-1.5">
          {top.map((w, i) => (
            <li key={i} className="flex items-center gap-3 text-[12.5px]">
              <span className="shrink-0 h-2 w-2 rounded-full bg-[color:var(--positive)]" />
              <span className="font-medium text-neutral-900 truncate">{w.label}</span>
              <span className="ml-auto text-[11px] text-neutral-500 tabular-nums shrink-0">
                {shortDate(w.period_start)} – {shortDate(w.period_end)}
              </span>
            </li>
          ))}
          {sorted.length > top.length && (
            <li className="text-[11px] text-neutral-400">
              +{sorted.length - top.length} more on the chart
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/**
 * Slice the forecast points to a window centred on the target period.
 *
 * Monthly: targets like "Nov.26" match the `period` string directly, take
 * `radius` months on each side.
 *
 * Weekly: target period is still a month label ("Nov.26"), so we find the
 * first week whose Monday falls inside that month and take `radius` weeks
 * around it. ~12 weeks gives 3 months of context — enough to see the
 * targeted month plus the run-up.
 */
function focusAroundTarget(
  points: ForecastPoint[],
  targetPeriod: string | undefined,
  radius: number,
  granularity: "month" | "week" = "month",
): ForecastPoint[] {
  if (!targetPeriod || points.length === 0) return points

  let idx = -1
  if (granularity === "month") {
    idx = points.findIndex((p) => p.period === targetPeriod)
  } else {
    const targetMonth = monthFromPeriod(targetPeriod)
    if (targetMonth) {
      idx = points.findIndex((p) => {
        const d = new Date(p.period_start)
        return d.getUTCFullYear() === targetMonth.year && d.getUTCMonth() + 1 === targetMonth.month
      })
    }
  }
  if (idx < 0) return points
  const start = Math.max(0, idx - radius)
  const end = Math.min(points.length, idx + radius + 1)
  return points.slice(start, end)
}

/** Parse "Nov.26" or "2026-11" → {year, month} (1-indexed). */
function monthFromPeriod(period: string): { year: number; month: number } | null {
  if (period.includes(".")) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    const [m, y] = period.toLowerCase().split(".")
    const month = months.indexOf(m) + 1
    if (month === 0) return null
    const year = parseInt(y.length === 2 ? `20${y}` : y, 10)
    return Number.isFinite(year) ? { year, month } : null
  }
  if (period.includes("-")) {
    const [y, m] = period.split("-").map((n) => parseInt(n, 10))
    return Number.isFinite(y) && Number.isFinite(m) ? { year: y, month: m } : null
  }
  return null
}

function humanPeriod(period: string): string {
  if (!period) return period
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  if (period.includes(".")) {
    const [m, y] = period.split(".")
    return `${m} '${y.length === 2 ? y : y.slice(2)}`
  }
  if (period.includes("-")) {
    const [y, m] = period.split("-")
    const idx = parseInt(m, 10) - 1
    return idx >= 0 ? `${months[idx]} '${y.slice(2)}` : period
  }
  return period
}
