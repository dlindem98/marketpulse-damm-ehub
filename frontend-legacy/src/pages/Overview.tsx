/**
 * Overview — Dub's analytics page composition.
 *
 *   page header (title + period)
 *   sticky filter bar
 *   KPI row (4 tiles)
 *   main chart card (time-series)
 *   2-col row: problem SKUs table + sub-channel bar chart
 *   LLM "story of the period" card
 */

import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowUpRight, AlertCircle } from "lucide-react"

import { StickyFilterBar } from "@/components/StickyFilterBar"
import { KpiRow } from "@/components/KpiRow"
import { ForecastAreaChart } from "@/components/charts/ForecastAreaChart"
import { GapByChannelChart } from "@/components/charts/GapByChannelChart"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useKpis, useGap, useMeta, useExplainView,
  useForecastTimeline, useForecastByChannel,
} from "@/lib/hooks"
import {
  formatHl, formatPercent, formatPeriodShort, gapColor,
} from "@/lib/format"

type Summary = {
  headline: string
  bullets: string[]
  suggested_next_action: string | null
}

export default function Overview() {
  const [params] = useSearchParams()
  const brand = params.get("brand")
  const sub_channel = params.get("sub_channel")

  const { data: meta } = useMeta()
  const { data: kpis } = useKpis()
  const { data: timeline } = useForecastTimeline(brand, sub_channel)
  const { data: byChannel } = useForecastByChannel(brand)
  const { data: gap } = useGap(sub_channel, 8)

  const explainMut = useExplainView()
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!kpis) return
    explainMut.mutate({
      page: "overview",
      filters: { brand, sub_channel, period_range: kpis.period_range },
      visible_state: {
        total_forecast_hl: kpis.total_forecast_hl,
        total_target_hl: kpis.total_budget_hl,
        gap_hl: kpis.gap_hl,
        gap_pct: kpis.gap_pct,
        on_track_skus: kpis.on_track_skus,
        off_track_skus: kpis.off_track_skus,
      },
    }, { onSuccess: setSummary })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis?.total_forecast_hl, brand, sub_channel])

  const periodRange = kpis
    ? `${formatPeriodShort(kpis.period_range[0])} → ${formatPeriodShort(kpis.period_range[1])}`
    : ""

  return (
    <div className="px-6 pt-5 pb-12 max-w-7xl mx-auto">
      <PageHeader title="Overview" subtitle="Aggregated UK forecast vs target across all channels and SKUs." rightLabel={periodRange} />
      <StickyFilterBar />

      <div className="space-y-4 mt-4">
        <KpiRow kpis={kpis} />

        <Card>
          <CardTitle title="Forecast vs target" subtitle="Monthly aggregated · 80% prediction interval shaded">
            <Legend />
          </CardTitle>
          <div className="px-4 pb-4">
            {!timeline ? <Skeleton className="h-[320px] w-full" /> : <ForecastAreaChart points={timeline} />}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3">
            <CardTitle title="Most-at-risk SKU-months" subtitle="Sorted by % below target — click a row to investigate" />
            {!gap ? (
              <div className="px-4 pb-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : gap.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                No SKU-months matched your filters.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {gap.slice(0, 8).map((g) => {
                  const sku = meta?.skus.find(s => s.id === g.sku)
                  const channel = meta?.sub_channels_labeled.find(c => c.code === g.sub_channel)
                  return (
                    <Link
                      key={`${g.sku}-${g.period}`}
                      to={`/forecast?sku=${g.sku}&sub_channel=${encodeURIComponent(g.sub_channel)}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{sku?.label ?? g.sku}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {channel?.label ?? g.sub_channel} · {formatPeriodShort(g.period)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium tabular-nums" style={{ color: gapColor(g.gap_pct) }}>
                          {formatPercent(g.gap_pct)}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {formatHl(g.forecast_hl)} / {formatHl(g.budget_hl)}
                        </div>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardTitle title="By sub-channel" subtitle="Bar length = Hl. Color = gap vs target." />
            <div className="px-4 pb-4">
              {!byChannel ? <Skeleton className="h-[260px] w-full" /> : <GapByChannelChart rows={byChannel} />}
            </div>
          </Card>
        </div>

        <Card>
          <CardTitle
            title={summary?.headline ?? "Generating story of the period…"}
            subtitle="LLM-generated executive summary of the current view"
          />
          <div className="px-4 pb-4">
            {!summary ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            ) : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2"><span className="text-muted-foreground/40">•</span><span>{b}</span></li>
                ))}
                {summary.suggested_next_action && (
                  <li className="pt-3 mt-2 border-t border-border text-foreground">
                    → <span className="font-medium">{summary.suggested_next_action}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// Shared minimal building blocks — keep page-level files terse
export function PageHeader({ title, subtitle, rightLabel }: { title: string; subtitle?: string; rightLabel?: string }) {
  return (
    <div className="mb-1">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {rightLabel && <span className="text-[11px] text-muted-foreground tabular-nums">{rightLabel}</span>}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card ${className}`}>{children}</div>
  )
}

export function CardTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 pt-3.5 pb-3">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium tracking-tight">{title}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[color:#3b82f6]" />
        Forecast
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[color:#3b82f6]/20 border border-[color:#3b82f6]/40" />
        80% PI
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-[1.5px] bg-[color:#a1a1aa]" />
        Target
      </span>
    </div>
  )
}
