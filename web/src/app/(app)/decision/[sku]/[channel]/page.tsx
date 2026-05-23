/**
 * Decision page — one SKU × sub-channel.
 *
 * Three views share the same route, switched by `?tab=`:
 *   - default (Overview): KPI strip, focused chart, drivers, recommended action
 *   - ?tab=simulate     : reached via the Overview's "Try this play" CTA
 *   - ?tab=options      : reached via "Compare alternatives" link
 *
 * No tab strip — the flow is linear (problem → plan → simulate) and the back
 * link in each non-default view replaces the tab bar.
 */

import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { serverFetch } from "@/lib/api"
import { skuLabel, channelLabel } from "@/lib/meta"
import { formatPeriod } from "@/lib/format"
import type { components } from "@/lib/api.gen"
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
  searchParams: Promise<{ period?: string; tab?: string; granularity?: string }>
}) {
  const { sku: skuRaw, channel: channelRaw } = await params
  const { period, tab, granularity: granRaw } = await searchParams
  const granularity: "month" | "week" = granRaw === "week" ? "week" : "month"
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

  const VALID_TABS = ["diagnosis", "options", "simulate"] as const
  type TabSlot = (typeof VALID_TABS)[number]
  const activeTab: TabSlot = (VALID_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as TabSlot)
    : "diagnosis"

  const backToOverviewHref =
    `/decision/${encodeURIComponent(sku)}/${encodeURIComponent(sub_channel)}` +
    (targetPeriod ? `?period=${encodeURIComponent(targetPeriod)}` : "")

  const subhead =
    `${channelLabel(meta, sub_channel)} · ${targetPeriod ? formatPeriod(targetPeriod) : "—"}`

  // Compose the header title so the channel + period live inline next to the
  // SKU name. Pushes the panel content up and frees a row of vertical space.
  const headerTitle = (
    <span className="flex items-baseline gap-2 min-w-0">
      <span className="truncate">{skuLabel(meta, sku)}</span>
      <span className="hidden sm:inline text-[13px] font-normal text-neutral-500 truncate">
        {subhead}
      </span>
    </span>
  )

  return (
    <PageContent title={headerTitle} titleBackHref="/">
      <PageWidthWrapper className="pb-12">
        {activeTab === "diagnosis" ? (
          <Suspense fallback={<PanelSkeleton />}>
            <DiagnosisPanel
              sku={sku}
              sub_channel={sub_channel}
              currentGap={currentGap ?? null}
              targetPeriod={targetPeriod}
              granularity={granularity}
            />
          </Suspense>
        ) : (
          <>
            <Link
              href={backToOverviewHref as Parameters<typeof Link>[0]["href"]}
              className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to overview
            </Link>
            <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-neutral-900 mt-3 mb-8">
              {activeTab === "simulate" ? "Simulate this play" : "Compare alternatives"}
            </h2>
            {activeTab === "options" ? (
              <Suspense fallback={<PanelSkeleton />}>
                <OptionsPanel sku={sku} sub_channel={sub_channel} period={targetPeriod} />
              </Suspense>
            ) : (
              <SimulatePanel sku={sku} sub_channel={sub_channel} />
            )}
          </>
        )}
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
