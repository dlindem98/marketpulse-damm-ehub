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
import { ArrowRight } from "lucide-react"
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
type ExternalSignalsT = components["schemas"]["ExternalSignals"]
type ExternalSignalsTimelineT = components["schemas"]["ExternalSignalsTimeline"]
type GapItem = components["schemas"]["GapItem"]
type RecResponse = components["schemas"]["RecommendationResponse"]
type RecScenario = components["schemas"]["RecommendationScenario"]

const CONFIDENCE_CHIP: Record<string, string> = {
  high:   "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
  medium: "bg-neutral-100 text-neutral-600",
  low:    "bg-[color:var(--negative-soft)] text-[color:var(--negative)]",
}

const SCENARIO_META: Record<
  RecScenario["label"],
  { title: string; tag: string; tagClass: string }
> = {
  conservative: {
    title: "Conservative",
    tag: "Low risk",
    tagClass: "bg-neutral-100 text-neutral-600",
  },
  balanced: {
    title: "Balanced",
    tag: "Recommended",
    tagClass: "bg-neutral-900 text-white",
  },
  aggressive: {
    title: "Aggressive",
    tag: "High upside",
    tagClass: "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
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

  const [forecast, drivers, rec, signals, signalsTimeline, targets] = await Promise.all([
    serverFetch<ForecastSeries>(`/api/forecast${fcQ}`),
    serverFetch<Driver[]>(`/api/drivers${baseQ}`),
    targetPeriod
      ? serverFetch<RecResponse>("/api/recommend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sku, sub_channel, period: targetPeriod }),
        }).catch(() => null)
      : Promise.resolve(null),
    targetPeriod
      ? serverFetch<ExternalSignalsT>(
          `/api/external-signals${baseQ}&period=${encodeURIComponent(targetPeriod)}`,
        ).catch(() => null)
      : Promise.resolve(null),
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

  // Order the scenarios so balanced sits in the middle visually, matching
  // the user's natural reading of "safer ← recommended → bolder".
  const scenariosOrdered = rec?.scenarios
    ? (["conservative", "balanced", "aggressive"] as const)
        .map((label) => rec.scenarios.find((s) => s.label === label))
        .filter((s): s is RecScenario => !!s)
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
              title="The model expects the real number to land inside this grey range 80% of the time. Wide range = the model is less sure (Volatile). Narrow range = high confidence (Bullish)."
            >
              <span className="inline-block h-2 w-4 rounded-sm bg-[var(--chart-1)]/15" />
              Likely range
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

        {forecast.promo_windows && forecast.promo_windows.length > 0 && (
          <PromosInPeriodCard
            windows={forecast.promo_windows}
            targetPeriod={targetPeriod}
          />
        )}

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
      {scenariosOrdered.length > 0 && (
        <section className="flex-1 flex flex-col min-h-[160px]">
          <header className="mb-3">
            <h3 className="text-[13px] font-semibold text-neutral-900">
              Pick a play
            </h3>
          </header>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
            {scenariosOrdered.map((s) => (
              <ScenarioCard
                key={s.label}
                scenario={s}
                href={simulateHrefFor(sku, sub_channel, targetPeriod, s.actions)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ScenarioCard({
  scenario,
  href,
}: {
  scenario: RecScenario
  href: string
}) {
  const meta = SCENARIO_META[scenario.label]
  const isBalanced = scenario.label === "balanced"
  const closurePct = scenario.total_expected_gap_closed_pct
  const closureColor = closurePct > 0 ? "text-[var(--positive)]" : "text-neutral-700"

  return (
    <Link
      href={href as Parameters<typeof Link>[0]["href"]}
      className={`group flex h-full items-center gap-3 rounded-xl border bg-white px-4 py-4 transition-all hover:border-neutral-400 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        isBalanced ? "border-neutral-900" : "border-neutral-200"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-neutral-900">{meta.title}</span>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide ${meta.tagClass}`}
          >
            {meta.tag}
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] text-neutral-500 leading-snug line-clamp-2">
          {scenario.headline}
        </p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className={`text-[16px] font-semibold leading-none ${closureColor}`}>
          {formatPercent(closurePct, 0)}
        </div>
        <div className="text-[10px] text-neutral-400 mt-0.5">gap closed</div>
      </div>
      <ArrowRight className="h-4 w-4 text-neutral-400 shrink-0 group-hover:text-neutral-700 transition-colors" />
    </Link>
  )
}

/**
 * Build the Simulator URL with prefill params taken from the balanced
 * scenario's first action. The simulator panel reads `months`, `discount`
 * and `promo` from the query string; missing params fall back to its own
 * defaults so this stays forward-compatible.
 */
function simulateHrefFor(
  sku: string,
  sub_channel: string,
  period: string | undefined,
  actions: components["schemas"]["RecommendationAction"][] | undefined,
): string {
  const base =
    `/decision/${encodeURIComponent(sku)}/${encodeURIComponent(sub_channel)}` +
    `?tab=simulate` +
    (period ? `&period=${encodeURIComponent(period)}` : "")
  const first = actions?.[0]
  if (!first) return base
  const months = (first.target_months ?? []).join(",")
  const promo = guessPromoType(first.action)
  const parts = [base]
  if (months) parts.push(`months=${encodeURIComponent(months)}`)
  if (promo) parts.push(`promo=${encodeURIComponent(promo)}`)
  return parts.join("&")
}

/** Cheap heuristic: pull a promo-type keyword out of the action sentence. */
function guessPromoType(action: string): string | null {
  const a = action.toLowerCase()
  if (a.includes("multi-buy") || a.includes("multi buy") || a.includes("for £")) return "multi-buy"
  if (a.includes("price-cut") || a.includes("price cut") || a.includes("discount")) return "price-cut"
  if (a.includes("rollback")) return "rollback"
  if (a.includes("clearance")) return "clearance"
  if (a.includes("listing")) return "listing"
  return null
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
  // Sort by start date; show up to 4. The user can see the rest as bands
  // on the chart above.
  const sorted = [...windows].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  )
  const top = sorted.slice(0, 3)
  return (
    <section className="h-full rounded-2xl border border-neutral-200 bg-white">
      <header className="px-4 pt-3 pb-2">
        <h3 className="text-[13px] font-semibold text-neutral-900">Planned promos</h3>
        <p className="text-[12px] text-neutral-500 mt-0.5">
          Trade activity in the chart window
          {targetPeriod ? ` around ${humanPeriod(targetPeriod)}` : ""}.
        </p>
      </header>
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
    </section>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/**
 * Single-line external context summary that sits under the chart in place
 * of the standalone "External context" card. Picks the most decision-
 * relevant signals (weather + first event) and drops the others; full
 * detail is still available via the /api/external-signals endpoint and
 * documented in the README.
 */
function ExternalContextLine({ signals }: { signals: ExternalSignalsT | null }) {
  if (!signals) return null
  const parts: string[] = []

  if (signals.weather.temp_c != null) {
    const t = signals.weather.temp_c.toFixed(1)
    const a = signals.weather.anomaly_c
    if (a != null && Math.abs(a) >= 0.5) {
      parts.push(`${t}°C (${a > 0 ? "+" : ""}${a.toFixed(1)}° vs avg)`)
    } else {
      parts.push(`${t}°C`)
    }
  }
  if (signals.search.beer != null) {
    parts.push(`beer interest ${signals.search.beer.toFixed(0)}`)
  }
  if (signals.events.length > 0) {
    parts.push(signals.events.map((e) => e.label).join(" · "))
  }
  if (parts.length === 0) return null

  return (
    <div className="border-t border-neutral-200 px-5 py-2.5 text-[11.5px] text-neutral-500">
      <span className="uppercase tracking-[0.14em] font-medium text-neutral-400 mr-2">
        Context
      </span>
      {parts.join(" · ")}
    </div>
  )
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
