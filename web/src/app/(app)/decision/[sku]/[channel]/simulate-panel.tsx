"use client"

/**
 * Step 3 — Simulate. Client Component.
 *
 * Impact workspace: baseline forecast is visible immediately, controls stay
 * compact, and running the scenario overlays the simulated line + KPI impact.
 */

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, Play, Sparkles } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SimulatorChart } from "@/components/charts/SimulatorChart"
import { formatHl, formatGBP, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type ForecastPoint = components["schemas"]["ForecastPoint"]
type SimResult = components["schemas"]["SimulationResult"]

const PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"] as const
type PromoType = (typeof PROMO_TYPES)[number]

const ACTION_TYPES = ["promo", "brand-focus", "channel-focus", "commercial-effort"] as const
type ActionType = (typeof ACTION_TYPES)[number]

const EFFORT_LEVELS = ["low", "medium", "high"] as const
type EffortLevel = (typeof EFFORT_LEVELS)[number]

const ACTION_META: Record<
  ActionType,
  { title: string; hint: string }
> = {
  "promo":             { title: "Trade promo",         hint: "Discount-driven lift on shelf. Highest impact, carries discount cost." },
  "brand-focus":       { title: "Brand push",          hint: "Marketing investment in the brand. Lifts pull-through, no discount cost." },
  "channel-focus":     { title: "Channel investment",  hint: "Extra effort inside this sub-channel (listings, fixture, activation)." },
  "commercial-effort": { title: "Commercial effort",   hint: "Sales-force push — order frequency, trade-up conversations." },
}

const fetcher = async (url: string): Promise<ForecastSeries> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<ForecastSeries>
}

export function SimulatePanel({
  sku,
  sub_channel,
  period,
}: {
  sku: string
  sub_channel: string
  period?: string
}) {
  const search = useSearchParams()
  const prefillMonths = (search.get("months") ?? "").split(",").filter(Boolean)
  const prefillPromoRaw = search.get("promo") ?? ""
  const prefillPromo = (PROMO_TYPES as readonly string[]).includes(prefillPromoRaw)
    ? (prefillPromoRaw as PromoType)
    : "multi-buy"
  const prefillDiscount = Number(search.get("discount") ?? "")
  const initialDiscount =
    Number.isFinite(prefillDiscount) && prefillDiscount > 0 && prefillDiscount <= 30
      ? prefillDiscount
      : 10
  // True when the user arrived from a "Pick a play" recommendation card
  // (any prefill param present). Drives the recommendation banner + the
  // simplified default view.
  const fromRecommendation = prefillMonths.length > 0
    || search.get("promo") !== null
    || search.get("discount") !== null

  const { data: forecast, error: forecastError } = useSWR<ForecastSeries>(
    `/api/forecast?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`,
    fetcher,
  )

  const [actionType, setActionType] = useState<ActionType>("promo")
  const [effortLevel, setEffortLevel] = useState<EffortLevel>("medium")
  const [discount, setDiscount] = useState(initialDiscount)
  const [promoType, setPromoType] = useState<PromoType>(prefillPromo)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(prefillMonths)
  const [result, setResult] = useState<SimResult | null>(null)
  const [pending, setPending] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const baselinePoints = useMemo(() => forecast?.points ?? [], [forecast?.points])
  const defaultMonth = useMemo(() => {
    if (!baselinePoints.length) return null
    return period && baselinePoints.some((p) => p.period === period)
      ? period
      : baselinePoints[0].period
  }, [baselinePoints, period])
  const activeMonths = selectedMonths.length > 0
    ? selectedMonths
    : defaultMonth
      ? [defaultMonth]
      : []
  const resultHasPoints = (result?.baseline.points?.length ?? 0) > 0
    && (result?.simulated.points?.length ?? 0) > 0
  const warning = result && !resultHasPoints ? result.notes : runError

  const chartSeries = useMemo(() => {
    if (resultHasPoints && result) {
      const simulatedByPeriod = new Map(
        (result.simulated.points ?? []).map((p) => [p.period, p.point]),
      )
      return baselinePoints.map((p) => ({
        period: p.period,
        baseline: p.point,
        simulated: simulatedByPeriod.get(p.period) ?? p.point,
      }))
    }
    return baselinePoints.map((p) => ({
      period: p.period,
      baseline: p.point,
      simulated: null,
    }))
  }, [baselinePoints, result, resultHasPoints])

  const selectedBaseline = sumSelected(baselinePoints, activeMonths)
  const simulatedTotal = resultHasPoints
    ? (result?.simulated.points ?? []).reduce((s, p) => s + p.point, 0)
    : null
  const baselineTotal = resultHasPoints
    ? (result?.baseline.points ?? []).reduce((s, p) => s + p.point, 0)
    : selectedBaseline
  const liftedHl = simulatedTotal == null ? null : simulatedTotal - baselineTotal
  const gapClosedPct = resultHasPoints && result ? result.gap_closed_pct * 100 : null
  const simulatedTone =
    liftedHl == null ? "neutral" : liftedHl >= 0 ? "positive" : "negative"

  async function handleRun() {
    if (!sku || !sub_channel || activeMonths.length === 0) return
    setPending(true)
    setRunError(null)
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku,
          sub_channel,
          months: activeMonths,
          action_type: actionType,
          // Promo-only fields — backend ignores them for other types.
          discount_pct: actionType === "promo" ? discount : 0,
          promo_type: promoType,
          // Effort-only field — backend ignores for promo.
          effort_level: effortLevel,
        }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      setResult(data as SimResult)
    } catch (err) {
      setResult(null)
      setRunError(err instanceof Error ? err.message : "Simulation failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-neutral-500">
            Impact workspace
          </div>
          <h2 className="mt-1 font-serif text-[30px] leading-[1.1] tracking-[-0.01em] text-neutral-900">
            Simulate this play
          </h2>
        </div>
        <div className="text-[12px] text-neutral-500">
          Baseline forecast vs promo scenario
        </div>
      </header>

      {/* Recommendation banner — only shown when arriving from a Pick-a-play
          card. Tells the user "we've pre-filled this from the recommendation,
          hit run or tweak below". Removes the guesswork of which controls
          matter. */}
      {fromRecommendation && (
        <div className="flex items-start gap-3 rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-3 text-white">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/60">
              Pre-filled from recommendation
            </div>
            <div className="mt-1 text-[13px] text-white/90 leading-snug">
              {actionType === "promo"
                ? `${promoLabel(promoType)} at ${discount}% across ${activeMonths.length || 0} month${activeMonths.length === 1 ? "" : "s"}`
                : `${ACTION_META[actionType].title} (${effortLevel}) across ${activeMonths.length || 0} month${activeMonths.length === 1 ? "" : "s"}`
              }
              {" — hit run, or tweak the controls below."}
            </div>
          </div>
          <Button
            onClick={handleRun}
            disabled={activeMonths.length === 0 || pending || !baselinePoints.length}
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1.5"
          >
            <Play className="h-3 w-3" />
            {pending ? "Running…" : "Run as-is"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard
          label="Current gap"
          value={
            resultHasPoints && result
              ? formatHl(result.gap_before_hl)
              : "—"
          }
          tone={result?.gap_before_hl && result.gap_before_hl < 0 ? "negative" : "neutral"}
        />
        <MetricCard
          label="Selected action"
          value={
            actionType === "promo"
              ? `${promoLabel(promoType)} · ${discount}%`
              : `${ACTION_META[actionType].title} · ${effortLevel}`
          }
          sub={`${activeMonths.length || 0} month${activeMonths.length === 1 ? "" : "s"}`}
        />
        <MetricCard
          label="Expected lift"
          value={liftedHl == null ? "—" : `${liftedHl > 0 ? "+" : ""}${formatHl(liftedHl)}`}
          tone={liftedHl == null ? "neutral" : liftedHl >= 0 ? "positive" : "negative"}
          sub={gapClosedPct == null ? "Run scenario" : `${gapClosedPct.toFixed(1)}% gap closed`}
        />
        <MetricCard
          label="Estimated cost"
          value={result?.estimated_cost ? formatGBP(result.estimated_cost) : "—"}
          sub={resultHasPoints && result ? `Gap after ${formatHl(result.gap_after_hl)}` : "After simulation"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold text-neutral-900">
                Baseline vs simulated forecast
              </h3>
              <p className="mt-0.5 text-[12px] text-neutral-500">
                Promo months are marked on the timeline.
              </p>
            </div>
            {resultHasPoints && result && (
              <div
                className={[
                  "rounded-full px-2.5 py-1 text-[11.5px] font-medium tabular-nums",
                  result.gap_closed_pct >= 0
                    ? "bg-[var(--positive)]/10 text-[var(--positive)]"
                    : "bg-[var(--negative)]/10 text-[var(--negative)]",
                ].join(" ")}
              >
                {result.gap_closed_pct >= 0 ? "+" : ""}
                {(result.gap_closed_pct * 100).toFixed(1)}%
              </div>
            )}
          </div>

          {forecastError ? (
            <Warning text="Could not load the baseline forecast." />
          ) : chartSeries.length > 0 ? (
            <SimulatorChart
              series={chartSeries}
              highlightedPeriods={activeMonths}
              simulatedTone={simulatedTone}
            />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-[13px] text-neutral-500">
              Loading baseline forecast…
            </div>
          )}

          {warning && <Warning text={warning} className="mt-3" />}
          {resultHasPoints && result?.notes && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-[12px] leading-relaxed text-neutral-600">
              {result.notes}
            </p>
          )}
        </section>

        <aside className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-[13px] font-semibold text-neutral-900">Scenario controls</h3>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            Pick an action, the months, and the intensity.
          </p>

          <div className="mt-5 space-y-5">
            {/* Action type — drives which secondary controls show below. */}
            <div>
              <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                Action type
              </label>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {ACTION_TYPES.map((t) => {
                  const active = actionType === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setResult(null)
                        setActionType(t)
                      }}
                      title={ACTION_META[t].hint}
                      className={[
                        "rounded-md border px-2 py-1.5 text-[11.5px] font-medium transition-colors text-left",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                      ].join(" ")}
                    >
                      {ACTION_META[t].title}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-500 leading-snug">
                {ACTION_META[actionType].hint}
              </p>
            </div>

            <div>
              <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                Months
              </label>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {baselinePoints.map((p) => {
                  const active = activeMonths.includes(p.period)
                  return (
                    <button
                      key={p.period}
                      type="button"
                      onClick={() => {
                        setResult(null)
                        setSelectedMonths((prev) =>
                          (prev.length > 0 ? prev : activeMonths).includes(p.period)
                            ? (prev.length > 0 ? prev : activeMonths).filter((m) => m !== p.period)
                            : [...(prev.length > 0 ? prev : activeMonths), p.period],
                        )
                      }}
                      className={[
                        "rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                      ].join(" ")}
                    >
                      {formatPeriodShort(p.period)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Promo-only controls: discount slider + promo type. */}
            {actionType === "promo" && (
              <>
                <div>
                  <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                    Discount <span className="font-semibold text-neutral-900">{discount}%</span>
                  </label>
                  <Slider
                    value={[discount]}
                    onValueChange={(v: number[]) => {
                      setResult(null)
                      setDiscount(v[0])
                    }}
                    min={0}
                    max={30}
                    step={1}
                    className="mt-3"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                    Promo mechanic
                  </label>
                  <Select
                    value={promoType}
                    onValueChange={(v) => {
                      setResult(null)
                      setPromoType(v as PromoType)
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROMO_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{promoLabel(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Non-promo controls: effort level (low / medium / high). */}
            {actionType !== "promo" && (
              <div>
                <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                  Effort level
                </label>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {EFFORT_LEVELS.map((lvl) => {
                    const active = effortLevel === lvl
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setResult(null)
                          setEffortLevel(lvl)
                        }}
                        className={[
                          "rounded-md border px-2 py-1.5 text-[12px] font-medium capitalize transition-colors",
                          active
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                        ].join(" ")}
                      >
                        {lvl}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <Button
              onClick={handleRun}
              disabled={activeMonths.length === 0 || pending || !baselinePoints.length}
              className="w-full gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              {pending ? "Simulating…" : "Run scenario"}
            </Button>
          </div>
        </aside>
      </div>
    </section>
  )
}

function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: "positive" | "negative" | "neutral"
}) {
  const color =
    tone === "positive"
      ? "text-[var(--positive)]"
      : tone === "negative"
        ? "text-[var(--negative)]"
        : "text-neutral-900"
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-[20px] font-semibold tracking-tight tabular-nums ${color}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-neutral-500">{sub}</div>}
    </div>
  )
}

function Warning({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ${className}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function sumSelected(points: ForecastPoint[], selectedMonths: string[]): number {
  const selected = new Set(selectedMonths)
  return points.reduce((sum, p) => sum + (selected.has(p.period) ? p.point : 0), 0)
}

function promoLabel(type: PromoType): string {
  return type
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
}
