/**
 * Forecast — detail view for a single SKU × sub-channel.
 * Dub composition: header + filter bar + chart card + per-month table.
 */

import { useSearchParams } from "react-router-dom"
import { useMemo } from "react"

import { StickyFilterBar } from "@/components/StickyFilterBar"
import { ForecastAreaChart } from "@/components/charts/ForecastAreaChart"
import { Skeleton } from "@/components/ui/skeleton"
import { useForecast, useMeta, useGap, useAnomalies } from "@/lib/hooks"
import { formatHl, formatPercent, formatPeriod, gapColor } from "@/lib/format"
import { PageHeader, Card, CardTitle } from "./Overview"

export default function Forecast() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"

  const { data: meta } = useMeta()
  const { data: forecast, isLoading } = useForecast(sku, sub_channel)
  const { data: gap } = useGap(sub_channel ?? null, 50)
  const { data: anomalies } = useAnomalies(sub_channel ?? null, 20)

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const skuBrand = meta?.skus.find(s => s.id === sku)?.brand ?? ""
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  const skuGaps = useMemo(() => {
    if (!gap) return []
    return gap.filter(g => g.sku === sku).sort((a, b) => a.period.localeCompare(b.period))
  }, [gap, sku])

  const chartPoints = useMemo(() => {
    if (!forecast) return []
    const tgtByPeriod = new Map(skuGaps.map(g => [g.period, g.budget_hl]))
    return forecast.points.map(p => ({
      period: p.period,
      point: p.point,
      lo80: p.lo80,
      hi80: p.hi80,
      target: tgtByPeriod.get(p.period) ?? null,
    }))
  }, [forecast, skuGaps])

  return (
    <div className="px-6 pt-5 pb-12 max-w-7xl mx-auto">
      <PageHeader title={sku ? skuLabel : "Forecast"} subtitle={sku ? `${skuBrand} · ${channelLabel}` : "Pick a SKU to drill into its forecast."} />
      <StickyFilterBar />

      {!sku && (
        <Card className="mt-4">
          <div className="py-12 px-6 text-center text-sm text-muted-foreground">
            Use the SKU dropdown above to drill into a specific product's forecast.
          </div>
        </Card>
      )}

      {sku && (
        <div className="space-y-4 mt-4">
          <Card>
            <CardTitle
              title={`Forecast vs target · next ${forecast?.points.length ?? "?"} months`}
              subtitle="Shaded band = 80% prediction interval (post-conformal calibration)"
            >
              {anomalies && anomalies.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {anomalies.length} historical anomalies in this channel
                </span>
              )}
            </CardTitle>
            <div className="px-4 pb-4">
              {isLoading || !forecast ? <Skeleton className="h-[320px] w-full" /> : <ForecastAreaChart points={chartPoints} />}
            </div>
          </Card>

          {skuGaps.length > 0 && (
            <Card>
              <CardTitle title="Per-month detail" />
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="text-left py-2.5 px-4 font-medium">Month</th>
                    <th className="text-right py-2.5 px-4 font-medium">Forecast</th>
                    <th className="text-right py-2.5 px-4 font-medium">Target</th>
                    <th className="text-right py-2.5 px-4 font-medium">Gap</th>
                    <th className="text-right py-2.5 px-4 font-medium pr-5">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {skuGaps.map((g) => (
                    <tr key={g.period} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="py-2 px-4">{formatPeriod(g.period)}</td>
                      <td className="py-2 px-4 text-right tabular-nums">{formatHl(g.forecast_hl)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">{formatHl(g.budget_hl)}</td>
                      <td className="py-2 px-4 text-right tabular-nums" style={{ color: gapColor(g.gap_pct) }}>
                        {formatPercent(g.gap_pct)}
                      </td>
                      <td className="py-2 px-4 text-right pr-5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          g.confidence === "high" ? "bg-primary text-primary-foreground" :
                          g.confidence === "medium" ? "bg-secondary text-secondary-foreground" :
                          "border border-border text-muted-foreground"
                        }`}>{g.confidence}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
