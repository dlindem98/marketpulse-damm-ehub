/**
 * Promos — ROI ranking with honest negative-lift rows.
 */

import { Skeleton } from "@/components/ui/skeleton"
import { StickyFilterBar } from "@/components/StickyFilterBar"
import { usePromoROI } from "@/lib/hooks"
import { formatHl, formatPercent, formatGBP, gapColor } from "@/lib/format"
import { PageHeader, Card, CardTitle } from "./Overview"

export default function Promos() {
  const { data: roi, isLoading } = usePromoROI()

  return (
    <div className="px-6 pt-5 pb-12 max-w-7xl mx-auto">
      <PageHeader
        title="Promotion impact"
        subtitle="Historical lift estimated by diff-in-diff against prior-12-month same-month baseline (GROCERY only)."
      />
      <StickyFilterBar />

      <Card className="mt-4">
        <CardTitle
          title={roi ? `${roi.length} promo types analysed` : "Promo ROI"}
          subtitle="ROI = (lift × revenue per Hl) ÷ estimated cost"
        />

        {isLoading || !roi ? (
          <div className="px-4 pb-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="text-left py-2.5 px-4 font-medium">Promo type</th>
                <th className="text-right py-2.5 px-4 font-medium">Avg lift %</th>
                <th className="text-right py-2.5 px-4 font-medium">Avg lift Hl</th>
                <th className="text-right py-2.5 px-4 font-medium">Est. cost</th>
                <th className="text-right py-2.5 px-4 font-medium">ROI</th>
                <th className="text-right py-2.5 px-4 font-medium">n</th>
                <th className="text-center py-2.5 px-4 font-medium pr-5">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {roi.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/40">
                  <td className="py-2.5 px-4 font-medium capitalize">{r.promo_type}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold" style={{ color: gapColor(r.avg_lift_pct) }}>
                    {formatPercent(r.avg_lift_pct)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                    {r.avg_lift_hl > 0 ? "+" : ""}{formatHl(r.avg_lift_hl)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                    {r.estimated_cost ? formatGBP(r.estimated_cost) : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    {r.roi !== null ? r.roi.toFixed(2) : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{r.n_observations}</td>
                  <td className="py-2.5 px-4 text-center pr-5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      r.confidence === "high" ? "bg-primary text-primary-foreground" :
                      r.confidence === "medium" ? "bg-secondary text-secondary-foreground" :
                      "border border-border text-muted-foreground"
                    }`}>{r.confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
