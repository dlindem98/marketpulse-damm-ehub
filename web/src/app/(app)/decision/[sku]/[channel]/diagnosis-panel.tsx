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
import { ExternalSignals } from "@/components/charts/ExternalSignals"
import { serverFetch } from "@/lib/api"
import { driverLabel } from "@/lib/driver-labels"
import { confidenceLabel, formatGBP, formatHl, formatPercent, gapColor } from "@/lib/format"
import type { components } from "@/lib/api.gen"
import { GranularityToggle } from "./granularity-toggle"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type ForecastPoint = components["schemas"]["ForecastPoint"]
type Driver = components["schemas"]["Driver"]
type ExplainView = components["schemas"]["ExplainViewSummary"]
type ExternalSignalsT = components["schemas"]["ExternalSignals"]
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

  const [forecast, drivers, rec, signals] = await Promise.all([
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
    <div className="space-y-5">
      {/* Three KPIs only. Confidence demoted to a chip in the chart header,
          Forecast/Target/Gap are the numbers that answer the brief's
          "above or below budget" question. */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Forecast"
          value={currentGap ? formatHl(currentGap.forecast_hl) : "—"}
        />
        <KpiCard
          label="Target"
          value={currentGap ? formatHl(currentGap.budget_hl) : "—"}
        />
        <KpiCard
          label="Gap"
          value={
            currentGap ? (
              <span style={{ color: gapColor(currentGap.gap_pct) }}>
                {formatPercent(currentGap.gap_pct, 1)}
              </span>
            ) : "—"
          }
          sub={
            currentGap && currentGap.gap_gbp != null
              ? `≈ ${formatGBP(currentGap.gap_gbp)}`
              : undefined
          }
        />
      </div>

      {/* Narrative — quiet headline above the chart. Hidden on LLM fallback. */}
      {narrative && (
        <section>
          <h2 className="font-serif text-[22px] leading-[1.2] tracking-[-0.01em] text-neutral-900">
            {narrative.headline}
          </h2>
        </section>
      )}

      {/* Chart + drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white">
          <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-neutral-900">Forecast vs target</h3>
              <p className="text-[12px] text-neutral-500 mt-0.5">
                {targetPeriod
                  ? `Around ${humanPeriod(targetPeriod)} · 80% band`
                  : "Median forecast with 80% confidence band"}
              </p>
            </div>
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
              promoWindows={forecast.promo_windows ?? []}
              events={forecast.events ?? []}
            />
          </div>
          {narrative && narrative.bullets?.length > 0 && (
            <div className="border-t border-neutral-200 px-5 py-3 text-[12.5px] text-neutral-600">
              {narrative.bullets[0]}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <header className="px-5 pt-4 pb-2">
            <h3 className="text-[13px] font-semibold text-neutral-900">Top drivers</h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              What&apos;s pushing the forecast up or down.
            </p>
          </header>
          <div className="px-5 pb-4 space-y-2.5">
            {drivers.slice(0, 3).map((d, i) => {
              const isUp = d.direction === "positive"
              const contribution = formatHl(Math.abs(d.shap_value))
              return (
                <div key={i} className="flex items-center gap-3">
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

        {/* External context — small block listing the non-Damm signals the
            forecast already consumes. Brief explicitly values visible
            enrichment. */}
        <ExternalSignals signals={signals} />
        </div>
      </div>

      {/* Three plays the LLM proposed. Each card → Simulator prefilled with
          that scenario's months/promo. The user picks a vibe (safer / sweet
          spot / bolder) and lands in the sandbox ready to tweak. */}
      {scenariosOrdered.length > 0 && (
        <section>
          <header className="mb-3">
            <h3 className="text-[13px] font-semibold text-neutral-900">
              Pick a play
            </h3>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
      className={`group flex flex-col rounded-2xl border bg-white p-5 transition-all hover:border-neutral-400 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
        isBalanced ? "border-neutral-900" : "border-neutral-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-neutral-900">{meta.title}</div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.tagClass}`}
        >
          {meta.tag}
        </span>
      </div>

      <p className="mt-3 text-[13px] text-neutral-700 leading-snug line-clamp-3">
        {scenario.headline}
      </p>

      <div className="mt-4 flex items-baseline gap-1.5 tabular-nums">
        <span className={`text-[22px] font-semibold tracking-tight ${closureColor}`}>
          {formatPercent(closurePct, 0)}
        </span>
        <span className="text-[11.5px] text-neutral-500">of gap closed</span>
      </div>

      <div className="mt-1 text-[11.5px] text-neutral-500">
        {scenario.actions?.length ?? 0} action
        {(scenario.actions?.length ?? 0) === 1 ? "" : "s"}
      </div>

      <div className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-900 group-hover:gap-2 transition-all">
        Simulate
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
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

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.16em] text-neutral-500 font-medium">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tabular-nums tracking-tight leading-none text-neutral-900">
          {value}
        </span>
        {sub && (
          <span className="text-[11.5px] tabular-nums text-neutral-500">{sub}</span>
        )}
      </div>
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
