/**
 * Forecast quality over time — actuals vs (back-tested) predictions.
 *
 * The single most important credibility signal in the product. A
 * commercial manager has no reason to trust "12.4k hL in week 22" until
 * they see what the model *used to say* lined up against what *actually
 * happened*. This component is that view.
 *
 * Server Component: fetches /api/forecast/quality on the server. If the
 * endpoint returns n_points === 0 (no historical data for this SKU ×
 * channel), the whole section hides silently — no broken-state UI.
 *
 * Designed to drop in below the existing ForecastChart in DiagnosisPanel.
 */

import { Badge } from "@/components/ui/badge"
import { serverFetch } from "@/lib/api"
import type { components } from "@/lib/api.gen"
import { ForecastQualityChart } from "./ForecastQualityChart"

type QualityResponse = components["schemas"]["QualityResponse"]

export async function ForecastQuality({
  sku,
  sub_channel,
}: {
  sku: string
  sub_channel: string
}) {
  const q = `?sku=${encodeURIComponent(sku)}&channel=${encodeURIComponent(sub_channel)}`
  const data = await serverFetch<QualityResponse>(`/api/forecast/quality${q}`).catch(
    () => null,
  )

  // Hide silently when there's no history to show — matches plan brief.
  if (!data || data.n_points === 0 || !data.points?.length) {
    return null
  }

  const recentTone: "good" | "warn" | null =
    data.mape_recent_pct <= 10 ? "good" : data.mape_recent_pct > 20 ? "warn" : null
  const recentLabel = recentTone === "good" ? "Good" : recentTone === "warn" ? "Wide" : null

  return (
    <div>
      <ForecastQualityChart points={data.points} />
      <div className="grid grid-cols-3 gap-3 mt-3">
        <StatTile
          label="Recent MAPE"
          value={`${data.mape_recent_pct.toFixed(1)}%`}
          chip={
            recentLabel ? (
              <Badge variant={recentTone === "good" ? "good" : "warn"}>{recentLabel}</Badge>
            ) : null
          }
        />
        <StatTile
          label="All-time MAPE"
          value={`${data.mape_pct.toFixed(1)}%`}
        />
        <StatTile
          label="Predictions"
          value={String(data.n_points)}
        />
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  chip,
}: {
  label: string
  value: string
  chip?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
          {value}
        </span>
        {chip}
      </div>
    </div>
  )
}
