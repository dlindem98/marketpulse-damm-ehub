"use client"

/**
 * Step 3 — Simulate. Client Component.
 *
 * Interactive form: months × promo type × discount. Hitting "Simulate" POSTs
 * to /api/simulate and renders baseline-vs-simulated chart + 3 KPIs.
 *
 * Why client-side: the user is going to adjust sliders rapidly. A round-trip
 * server render per slider tick would be painful. Local state + one API call
 * per "Simulate" button click is the right boundary.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SimulatorChart } from "@/components/charts/SimulatorChart"
import { api } from "@/lib/api"
import { formatHl, formatGBP, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type SimResult = components["schemas"]["SimulationResult"]

const PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"] as const
type PromoType = (typeof PROMO_TYPES)[number]

const fetcher = async (url: string): Promise<ForecastSeries> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<ForecastSeries>
}

export function SimulatePanel({ sku, sub_channel }: { sku: string; sub_channel: string }) {
  const search = useSearchParams()
  // Prefill from URL (set by the Overview's "Try this play" CTA). Falls back
  // to defaults so direct navigation still works.
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

  const { data: forecast } = useSWR<ForecastSeries>(
    `/api/forecast?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`,
    fetcher,
  )

  const [discount, setDiscount] = useState(initialDiscount)
  const [promoType, setPromoType] = useState<PromoType>(prefillPromo)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(prefillMonths)
  const [result, setResult] = useState<SimResult | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (forecast?.points && forecast.points.length > 0 && selectedMonths.length === 0) {
      setSelectedMonths([forecast.points![2]?.period ?? forecast.points![0].period])
    }
  }, [forecast, selectedMonths.length])

  async function handleRun() {
    if (!sku || !sub_channel || selectedMonths.length === 0) return
    setPending(true)
    try {
      const { data, error } = await api.POST("/api/simulate", {
        body: {
          sku,
          sub_channel,
          months: selectedMonths,
          discount_pct: discount,
          promo_type: promoType,
        },
      })
      if (error) throw new Error(JSON.stringify(error))
      setResult(data as SimResult)
    } finally {
      setPending(false)
    }
  }

  const gapClosedPct = result ? result.gap_closed_pct * 100 : 0
  const liftedHl = result
    ? (result.simulated.points ?? []).reduce((s, p) => s + p.point, 0) -
      (result.baseline.points ?? []).reduce((s, p) => s + p.point, 0)
    : 0

  const chartSeries = result
    ? (result.baseline.points ?? []).map((b, i) => ({
        period: b.period,
        baseline: b.point,
        simulated: (result.simulated.points ?? [])[i]?.point ?? b.point,
      }))
    : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>Pick months, a promo type and a discount, then run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Promo months
            </label>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {(forecast?.points ?? []).map((p) => {
                const active = selectedMonths.includes(p.period)
                return (
                  <button
                    key={p.period}
                    onClick={() =>
                      setSelectedMonths((prev) =>
                        prev.includes(p.period)
                          ? prev.filter((m) => m !== p.period)
                          : [...prev, p.period],
                      )
                    }
                    className={`px-2 py-1.5 text-xs rounded-md border transition font-medium ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    }`}
                  >
                    {formatPeriodShort(p.period)}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Discount: <span className="text-foreground font-semibold">{discount}%</span>
            </label>
            <Slider
              value={[discount]}
              onValueChange={(v: number[]) => setDiscount(v[0])}
              min={0} max={30} step={1}
              className="mt-3"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Promo type
            </label>
            <Select value={promoType} onValueChange={(v) => setPromoType(v as PromoType)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROMO_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleRun} disabled={selectedMonths.length === 0 || pending} className="w-full">
            {pending ? "Simulating…" : "Simulate"}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <CardDescription>Baseline vs simulated forecast.</CardDescription>
        </CardHeader>
        <CardContent>
          {!result && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Configure a scenario and hit Simulate.
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Metric
                  label="Gap closed"
                  value={
                    <span
                      style={{
                        color: result.gap_closed_pct > 0 ? "var(--positive)" : "var(--negative)",
                      }}
                    >
                      {gapClosedPct.toFixed(1)}%
                    </span>
                  }
                />
                <Metric
                  label="Lift added"
                  value={<>{liftedHl > 0 ? "+" : ""}{formatHl(liftedHl)}</>}
                />
                <Metric
                  label="Est. cost"
                  value={result.estimated_cost ? formatGBP(result.estimated_cost) : "—"}
                />
              </div>
              <SimulatorChart series={chartSeries} />
              <div className="text-[11px] text-muted-foreground italic border-t border-border pt-3">
                {result.notes}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1 tracking-tight">{value}</div>
    </div>
  )
}
