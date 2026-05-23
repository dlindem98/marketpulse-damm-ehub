/**
 * Decision page — one screen, end-to-end, for one SKU × sub-channel.
 *
 * Dub-admin composition:
 *   - bg-neutral-50 page
 *   - MaxWidthWrapper centers content
 *   - Header row: back link, h2 title + neutral-500 sub, gap card pinned right
 *   - Three numbered tabs below: Diagnosis / Options / Simulate
 */

import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { MaxWidthWrapper } from "@/components/shell/MaxWidthWrapper"
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

  return (
    <MaxWidthWrapper className="py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-900 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Inbox
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
              {skuLabel(meta, sku)}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {channelLabel(meta, sub_channel)} · {targetPeriod ? formatPeriod(targetPeriod) : "—"}
            </p>
          </div>

          {currentGap && (
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 min-w-[220px]">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
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
                        : "#171717",
                  }}
                >
                  {formatPercent(currentGap.gap_pct, 1)}
                </div>
                <div className="text-[12px] text-neutral-500 tabular-nums">
                  {formatHl(currentGap.gap_hl)}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-[10.5px] text-neutral-500 tabular-nums">
                  {formatHl(currentGap.forecast_hl)} / {formatHl(currentGap.budget_hl)}
                </div>
                <Badge variant="outline" className="capitalize">{currentGap.confidence}</Badge>
              </div>
            </div>
          )}
        </div>
      </div>

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
    </MaxWidthWrapper>
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
