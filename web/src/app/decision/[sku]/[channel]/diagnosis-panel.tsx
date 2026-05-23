/**
 * Step 1 — Diagnosis. Server Component.
 *
 * Three columns of information that together answer "what's going on":
 *   - Forecast chart (visual)
 *   - SHAP drivers (quantitative attribution)
 *   - LLM narrative (English explanation tying it together)
 *
 * Fetches forecast + drivers + LLM narrative in parallel. Forecast/drivers
 * complete in <100ms; LLM narrative takes a few seconds (but only one section
 * waits for it via its own Suspense in the parent if needed).
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ForecastChart } from "@/components/charts/ForecastChart"
import { DriversWaterfall } from "@/components/charts/DriversWaterfall"
import { serverFetch } from "@/lib/api"
import type { components } from "@/lib/api.gen"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type Driver = components["schemas"]["Driver"]
type ExplainView = components["schemas"]["ExplainViewSummary"]

export async function DiagnosisPanel({
  sku, sub_channel,
}: {
  sku: string
  sub_channel: string
}) {
  const q = `?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`

  const [forecast, drivers, narrative] = await Promise.all([
    serverFetch<ForecastSeries>(`/api/forecast${q}`),
    serverFetch<Driver[]>(`/api/drivers${q}`),
    serverFetch<ExplainView>("/api/explain-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page: "drivers",
        filters: { sku, sub_channel },
        visible_state: {},
      }),
    }).catch(() => null), // LLM is best-effort; don't block the rest
  ])

  // Target points come from forecast.targets if available — older API versions
  // may not include them, so guard.
  const targetByPeriod: Record<string, number> = {}
  // @ts-expect-error – forecast.targets may exist
  const targets = forecast.targets as Array<{ period: string; target_hl: number }> | undefined
  targets?.forEach((t) => {
    targetByPeriod[t.period] = t.target_hl
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Forecast + LLM narrative — the headline answer */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Forecast vs target</CardTitle>
          <CardDescription>
            Median forecast with 80% confidence band; dashed = target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForecastChart points={forecast.points ?? []} targetByPeriod={targetByPeriod} />
        </CardContent>

        {narrative && (
          <div className="border-t border-border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
              In plain English
            </div>
            <div className="text-[13.5px] font-medium leading-snug">{narrative.headline}</div>
            {narrative.bullets?.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
                {narrative.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground/40 mt-1">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {narrative.suggested_next_action && (
              <div className="text-[12px] mt-3 pt-3 border-t border-border">
                <span className="font-medium">Next: </span>
                <span className="text-muted-foreground">{narrative.suggested_next_action}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Drivers */}
      <Card>
        <CardHeader>
          <CardTitle>What&apos;s driving it</CardTitle>
          <CardDescription>SHAP contribution to forecast (Hl). Green ↑, red ↓.</CardDescription>
        </CardHeader>
        <CardContent>
          <DriversWaterfall drivers={drivers.slice(0, 8)} />
        </CardContent>
        {drivers.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Top driver
            </div>
            <div className="text-[13px] font-medium">{drivers[0].feature}</div>
            <div className="text-[11.5px] text-muted-foreground mt-1 leading-snug">
              {drivers[0].explanation}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
