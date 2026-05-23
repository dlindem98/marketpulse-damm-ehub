/**
 * Promo library — historical ROI by promo type.
 */

import { Suspense } from "react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { serverFetch } from "@/lib/api"
import { formatHl, formatPercent, formatGBP, gapColor } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type PromoROI = components["schemas"]["PromoROI"]

export default function Page() {
  return (
    <PageContent title="Promo library">
      <PageWidthWrapper className="pb-10">
        <p className="text-sm text-neutral-500 mb-6 max-w-2xl">
          Historical lift estimated by diff-in-diff against prior-12-month same-month baseline. GROCERY only.
          Negative-lift rows are shown honestly — they happened, and you should know.
        </p>

        <Suspense
          fallback={
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
            </div>
          }
        >
          <PromoTable />
        </Suspense>
      </PageWidthWrapper>
    </PageContent>
  )
}

async function PromoTable() {
  const roi = await serverFetch<PromoROI[]>("/api/promos/roi")

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-neutral-200 flex items-center justify-between">
        <div className="text-[12.5px] font-medium text-neutral-900">{roi.length} promo types analysed</div>
        <div className="text-[11px] text-neutral-500">ROI = (lift × revenue per Hl) ÷ estimated cost</div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
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
            <tr key={i} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50 transition-colors">
              <td className="py-2.5 px-4 font-medium capitalize text-neutral-900">{r.promo_type}</td>
              <td
                className="py-2.5 px-4 text-right tabular-nums font-semibold"
                style={{ color: gapColor(r.avg_lift_pct) }}
              >
                {formatPercent(r.avg_lift_pct)}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-neutral-500">
                {r.avg_lift_hl > 0 ? "+" : ""}{formatHl(r.avg_lift_hl)}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-neutral-500">
                {r.estimated_cost ? formatGBP(r.estimated_cost) : "—"}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-neutral-900">
                {r.roi !== null && r.roi !== undefined ? r.roi.toFixed(2) : "—"}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-neutral-500">
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
    </div>
  )
}
