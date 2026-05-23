/**
 * KpiRow — Dub's "metric tile" pattern (apps/web/ui/analytics/stats.tsx).
 *
 * Slim white cards with subtle borders, label in small caps,
 * big tabular number, sublabel below. No animation on update.
 */

import { Skeleton } from "@/components/ui/skeleton"
import { ArrowDown, ArrowUp } from "lucide-react"
import type { Kpis } from "@/lib/hooks"
import { formatHl, gapColor, gapLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

export function KpiRow({ kpis }: { kpis: Kpis | undefined }) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-lg" />)}
      </div>
    )
  }

  const gapPct = kpis.gap_pct
  const isBelow = gapPct < 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile label="Forecast" value={formatHl(kpis.total_forecast_hl)} />
      <Tile label="Target" value={formatHl(kpis.total_budget_hl)} sub="prior-year baseline" />
      <Tile
        label="Gap vs target"
        value={
          <span className="inline-flex items-center gap-1">
            {isBelow
              ? <ArrowDown className="w-4 h-4 text-[color:var(--negative)]" />
              : <ArrowUp className="w-4 h-4 text-[color:var(--positive)]" />}
            <span style={{ color: gapColor(gapPct) }}>
              {Math.abs(gapPct * 100).toFixed(1)}%
            </span>
          </span>
        }
        sub={`${isBelow ? "−" : "+"}${formatHl(Math.abs(kpis.gap_hl))} · ${gapLabel(gapPct)}`}
      />
      <Tile
        label="SKUs at risk"
        value={String(kpis.off_track_skus)}
        sub={`of ${kpis.on_track_skus + kpis.off_track_skus} forecasted`}
      />
    </div>
  )
}

function Tile({
  label, value, sub, muted = false,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  muted?: boolean
}) {
  return (
    <div className={cn(
      "rounded-lg border border-border bg-card px-4 py-3.5 min-h-[88px]",
      muted && "opacity-90",
    )}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1.5 tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{sub}</div>
      )}
    </div>
  )
}
