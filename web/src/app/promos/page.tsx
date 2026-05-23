/**
 * Promo library — historical ROI by promo type.
 *
 * This is the "what worked last year" reference desk. A Commercial Manager
 * opens it before a grocer call to remember which mechanics have ROI'd before.
 * It's intentionally a flat table — sortable, scannable, no charts. Charts
 * would imply "the ranking is the answer." It's not. Negotiation context is.
 *
 * Honest reporting: rows with negative lift are shown in red, NOT hidden.
 * Pretending every promo worked makes the tool untrustworthy.
 */

import { Suspense } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { serverFetch } from "@/lib/api"
import { formatHl, formatPercent, formatGBP, gapColor } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type PromoROI = components["schemas"]["PromoROI"]

export default function Page() {
  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Promo library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historical lift estimated by diff-in-diff against prior-12-month same-month baseline. GROCERY only.
          Negative-lift promos are shown honestly — they happened, and you should know.
        </p>
      </header>

      <Suspense
        fallback={
          <Card className="overflow-hidden">
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
            </div>
          </Card>
        }
      >
        <PromoTable />
      </Suspense>
    </div>
  )
}

async function PromoTable() {
  const roi = await serverFetch<PromoROI[]>("/api/promos/roi")

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="text-[12px] font-medium">{roi.length} promo types analysed</div>
        <div className="text-[11px] text-muted-foreground">ROI = (lift × revenue per Hl) ÷ estimated cost</div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <th className="text-left py-2.5 px-4 font-medium">Promo type</th>
            <th className="text-right py-2.5 px-4 font-medium">Avg lift %</th>
            <th className="text-right py-2.5 px-4 font-medium">Avg lift Hl</th>
            <th className="text-right py-2.5 px-4 font-medium">Est. cost</th>
            <th className="text-right py-2.5 px-4 font-medium">ROI</th>
            <th className="text-right py-2.5 px-4 font-medium">n</th>
            <th className="text-center py-2.5 px-4 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {roi.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/40">
              <td className="py-2.5 px-4 font-medium capitalize">{r.promo_type}</td>
              <td
                className="py-2.5 px-4 text-right tabular-nums font-semibold"
                style={{ color: gapColor(r.avg_lift_pct) }}
              >
                {formatPercent(r.avg_lift_pct)}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                {r.avg_lift_hl > 0 ? "+" : ""}{formatHl(r.avg_lift_hl)}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                {r.estimated_cost ? formatGBP(r.estimated_cost) : "—"}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums">
                {r.roi !== null && r.roi !== undefined ? r.roi.toFixed(2) : "—"}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                {r.n_observations}
              </td>
              <td className="py-2.5 px-4 text-center">
                <Badge
                  variant={
                    r.confidence === "high"
                      ? "default"
                      : r.confidence === "medium"
                      ? "secondary"
                      : "outline"
                  }
                  className="capitalize"
                >
                  {r.confidence}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
