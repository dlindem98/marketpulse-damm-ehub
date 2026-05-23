/**
 * Decision page — unified deep-dive for one SKU × sub-channel.
 *
 * Wrapped in <PageContent title={skuLabel} titleBackHref="/" controls={gapBadge}>
 * which gives us Dub-consumer's sticky title bar with back arrow + right-side
 * gap badge. Tabs render below in the content area.
 */

import { Suspense } from "react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Badge } from "@/components/ui/badge"
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

  const [meta, gaps] = await Promise.all([
    serverFetch<Meta>("/api/meta"),
    serverFetch<GapItem[]>("/api/gap"),
  ])

  const matchingGaps = gaps.filter((g) => g.sku === sku && g.sub_channel === sub_channel)
  const currentGap = period
    ? matchingGaps.find((g) => g.period === period) ?? matchingGaps[0]
    : matchingGaps[0]
  const targetPeriod = currentGap?.period ?? period

  const gapBadge = currentGap ? (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium leading-tight">Gap</div>
        <div
          className="text-sm font-semibold tabular-nums tracking-tight"
          style={{
            color:
              gapTone(currentGap.gap_pct) === "negative"
                ? "var(--negative)"
                : gapTone(currentGap.gap_pct) === "positive"
                ? "var(--positive)"
                : "#171717",
          }}
        >
          {formatPercent(currentGap.gap_pct, 1)} · {formatHl(currentGap.gap_hl)}
        </div>
      </div>
      <Badge variant="outline" className="capitalize">{currentGap.confidence}</Badge>
    </div>
  ) : null

  return (
    <PageContent title={skuLabel(meta, sku)} titleBackHref="/" controls={gapBadge}>
      <PageWidthWrapper className="pb-10">
        <p className="text-sm text-neutral-500 mb-6">
          {channelLabel(meta, sub_channel)} · {targetPeriod ? formatPeriod(targetPeriod) : "—"}
          {currentGap && (
            <>
              {" · forecast "}
              <span className="tabular-nums">{formatHl(currentGap.forecast_hl)}</span>
              {" vs target "}
              <span className="tabular-nums">{formatHl(currentGap.budget_hl)}</span>
            </>
          )}
        </p>

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
      </PageWidthWrapper>
    </PageContent>
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
