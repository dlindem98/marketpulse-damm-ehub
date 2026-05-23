/**
 * Simulator — controls panel + result panel.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { StickyFilterBar } from "@/components/StickyFilterBar"
import { SimulatorChart } from "@/components/charts/SimulatorChart"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useSimulate, useForecast, useMeta } from "@/lib/hooks"
import { formatHl, formatGBP, formatPeriodShort } from "@/lib/format"
import { PageHeader, Card, CardTitle } from "./Overview"

const PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"]

export default function Simulator() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"

  const { data: meta } = useMeta()
  const { data: forecast } = useForecast(sku, sub_channel)

  const [discount, setDiscount] = useState(10)
  const [promoType, setPromoType] = useState("multi-buy")
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const simulate = useSimulate()

  useEffect(() => {
    if (forecast?.points.length && selectedMonths.length === 0) {
      setSelectedMonths([forecast.points[2]?.period ?? forecast.points[0].period])
    }
  }, [forecast, selectedMonths.length])

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  const handleRun = () => {
    if (!sku || !sub_channel || selectedMonths.length === 0) return
    simulate.mutate({
      sku, sub_channel, months: selectedMonths,
      discount_pct: discount, promo_type: promoType,
    })
  }

  const result = simulate.data
  const gapClosed = result ? result.gap_closed_pct * 100 : 0
  const liftedHl = result
    ? result.simulated.points.reduce((s, p) => s + p.point, 0)
      - result.baseline.points.reduce((s, p) => s + p.point, 0)
    : 0

  const chartSeries = result
    ? result.baseline.points.map((b, i) => ({
        period: b.period,
        baseline: b.point,
        simulated: result.simulated.points[i]?.point ?? b.point,
      }))
    : []

  return (
    <div className="px-6 pt-5 pb-12 max-w-7xl mx-auto">
      <PageHeader title="What-if simulator" subtitle={sku ? `${skuLabel} · ${channelLabel}` : "Re-run the forecast with a hypothetical promo."} />
      <StickyFilterBar />

      {!sku && (
        <Card className="mt-4">
          <div className="py-12 px-6 text-center text-sm text-muted-foreground">
            Pick a SKU above. Then choose months, a promo type, and a discount to simulate.
          </div>
        </Card>
      )}

      {sku && !forecast && <Skeleton className="w-full h-[300px] mt-4" />}

      {sku && forecast && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
          <Card className="lg:col-span-2">
            <CardTitle title="Controls" subtitle="Configure a promo, then hit Simulate." />
            <div className="px-4 pb-4 space-y-5">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Promo months</label>
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {forecast.points.map(p => {
                    const active = selectedMonths.includes(p.period)
                    return (
                      <button
                        key={p.period}
                        onClick={() => setSelectedMonths(prev =>
                          prev.includes(p.period)
                            ? prev.filter(m => m !== p.period)
                            : [...prev, p.period]
                        )}
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
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Promo type</label>
                <Select value={promoType} onValueChange={setPromoType}>
                  <SelectTrigger className="mt-2 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMO_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <button
                onClick={handleRun}
                disabled={selectedMonths.length === 0 || simulate.isPending}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {simulate.isPending ? "Simulating…" : "Simulate"}
              </button>
            </div>
          </Card>

          <Card className="lg:col-span-3">
            <CardTitle title="Result" subtitle="Baseline vs simulated forecast" />
            <div className="px-4 pb-4">
              {!result && (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Configure a scenario and hit Simulate.
                </div>
              )}
              {result && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Metric label="Gap closed" value={
                      <span style={{ color: result.gap_closed_pct > 0 ? "var(--positive)" : "var(--negative)" }}>
                        {gapClosed.toFixed(1)}%
                      </span>
                    } />
                    <Metric label="Lift added" value={<>{liftedHl > 0 ? "+" : ""}{formatHl(liftedHl)}</>} />
                    <Metric label="Est. cost" value={result.estimated_cost ? formatGBP(result.estimated_cost) : "—"} />
                  </div>

                  <SimulatorChart series={chartSeries} />

                  <div className="text-[11px] text-muted-foreground italic border-t border-border pt-3">
                    {result.notes}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
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
