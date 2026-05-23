/**
 * Decision page — one screen, end-to-end, for one SKU × sub-channel.
 *
 * THE BIG PIVOT (was 4 pages, now 1):
 * Old IA split the story across /forecast, /drivers, /recommendations,
 * /simulator — forcing the Commercial Manager to mentally re-stitch context
 * each time. Now those four answer one question end-to-end on one URL:
 *
 *   1. DIAGNOSIS  — "what's going on with this SKU and why"
 *                   forecast chart + SHAP drivers + LLM narrative
 *   2. OPTIONS    — "what are my 3 plays"
 *                   conservative / balanced / aggressive scenario cards
 *                   (LLM-generated against real promo-ROI history)
 *   3. SIMULATE   — "let me tweak the chosen play and see what happens"
 *                   interactive controls + baseline-vs-simulated chart
 *
 * Tabs keep the URL stable; deep links to a specific tab via ?tab=… for chat references.
 *
 * Streaming: Diagnosis renders immediately (cheap parallel fetches).
 * Options + Simulate are Suspense'd because Recommend is a 5-10s LLM call.
 */

import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { serverFetch } from "@/lib/api"
import { skuLabel, channelLabel } from "@/lib/meta"
import { formatHl, formatPercent, gapTone, formatPeriod } from "@/lib/format"
import type { components } from "@/lib/api.gen"
import { DecisionTabs } from "./decision-tabs"
import { DiagnosisPanel } from "./diagnosis-panel"
import { OptionsPanel } from "./options-panel"
import { SimulatePanel } from "./simulate-panel"

type Meta = components["schemas"]["MetaResponse"]
type GapItem = components["schemas"]["GapItem"]

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string; channel: string }>
  searchParams: Promise<{ period?: string; tab?: string }>
}) {
  const { sku: skuRaw, channel: channelRaw } = await params
  const { period, tab } = await searchParams
  const sku = decodeURIComponent(skuRaw)
  const sub_channel = decodeURIComponent(channelRaw)

  // Top-of-page context: meta (for labels) + gap (for the headline number)
  const [meta, gaps] = await Promise.all([
    serverFetch<Meta>("/api/meta"),
    serverFetch<GapItem[]>("/api/gap"),
  ])

  const matchingGaps = gaps.filter((g) => g.sku === sku && g.sub_channel === sub_channel)
  const currentGap = period
    ? matchingGaps.find((g) => g.period === period) ?? matchingGaps[0]
    : matchingGaps[0]
  const targetPeriod = currentGap?.period ?? period

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Header — anchor the user: who, where, when, how bad */}
      <div className="mb-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Inbox
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {skuLabel(meta, sku)}
            </h1>
            <div className="text-sm text-muted-foreground mt-1">
              {channelLabel(meta, sub_channel)} · {targetPeriod ? formatPeriod(targetPeriod) : "—"}
            </div>
          </div>

          {currentGap && (
            <Card className="px-4 py-2.5 min-w-[200px]">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Gap to target
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <div
                  className="text-2xl font-semibold tabular-nums tracking-tight"
                  style={{
                    color:
                      gapTone(currentGap.gap_pct) === "negative"
                        ? "var(--negative)"
                        : gapTone(currentGap.gap_pct) === "positive"
                        ? "var(--positive)"
                        : "var(--foreground)",
                  }}
                >
                  {formatPercent(currentGap.gap_pct, 1)}
                </div>
                <div className="text-[12px] text-muted-foreground tabular-nums">
                  {formatHl(currentGap.gap_hl)}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="text-[10.5px] text-muted-foreground tabular-nums">
                  Forecast {formatHl(currentGap.forecast_hl)} · Target {formatHl(currentGap.budget_hl)}
                </div>
                <Badge variant="outline" className="capitalize">{currentGap.confidence}</Badge>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Three-step flow as tabs */}
      <DecisionTabs defaultTab={tab ?? "diagnosis"}>
        {{
          diagnosis: (
            <Suspense fallback={<PanelSkeleton />}>
              <DiagnosisPanel sku={sku} sub_channel={sub_channel} />
            </Suspense>
          ),
          options: (
            <Suspense fallback={<PanelSkeleton />}>
              <OptionsPanel sku={sku} sub_channel={sub_channel} period={targetPeriod} />
            </Suspense>
          ),
          simulate: (
            <SimulatePanel sku={sku} sub_channel={sub_channel} />
          ),
        }}
      </DecisionTabs>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Skeleton className="h-[320px] lg:col-span-2" />
      <Skeleton className="h-[320px]" />
    </div>
  )
}
