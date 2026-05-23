/**
 * Triage Inbox — home base for a UK Commercial Manager.
 *
 * Wrapped in <PageContent title="Inbox">; that gives us Dub-consumer's
 * sticky title bar + bordered content area. Inside, sections stack
 * vertically with PageWidthWrapper'd content.
 */

import Link from "next/link"
import { Suspense } from "react"
import { ArrowRight, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { serverFetch } from "@/lib/api"
import { formatHl, formatPercent, gapTone, formatPeriod } from "@/lib/format"
import { skuLabel, channelLabel } from "@/lib/meta"
import type { components } from "@/lib/api.gen"

type GapItem = components["schemas"]["GapItem"]
type Meta = components["schemas"]["MetaResponse"]

export default function Page() {
  return (
    <PageContent title="Inbox">
      <PageWidthWrapper className="pb-10">
        <div className="mb-6 max-w-2xl">
          <p className="text-sm text-neutral-500">
            UK SKUs ranked by gap to target. Open a row to diagnose, choose an action, and simulate it.
          </p>
        </div>

        <Suspense fallback={<InboxSkeleton />}>
          <Inbox />
        </Suspense>
      </PageWidthWrapper>
    </PageContent>
  )
}

async function Inbox() {
  const [gaps, meta] = await Promise.all([
    serverFetch<GapItem[]>("/api/gap"),
    serverFetch<Meta>("/api/meta"),
  ])

  const negatives = gaps
    .filter((g) => g.gap_hl < 0)
    .sort((a, b) => a.gap_hl - b.gap_hl)
    .slice(0, 20)

  const positives = gaps
    .filter((g) => g.gap_hl > 0)
    .sort((a, b) => b.gap_hl - a.gap_hl)
    .slice(0, 5)

  const totalGapHl = negatives.reduce((s, g) => s + g.gap_hl, 0)
  const negCount = gaps.filter((g) => g.gap_hl < 0).length

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          label="Behind target"
          value={`${negCount}`}
          unit="rows"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-[color:var(--negative)]" />}
        />
        <SummaryTile
          label="Total gap"
          value={formatHl(totalGapHl)}
          tone="negative"
          icon={<TrendingDown className="h-3.5 w-3.5 text-[color:var(--negative)]" />}
        />
        <SummaryTile
          label="Ahead of target"
          value={`${positives.length}`}
          unit="rows"
          icon={<TrendingUp className="h-3.5 w-3.5 text-[color:var(--positive)]" />}
        />
      </div>

      <Section title="Action queue" subtitle={`${negatives.length} items · sorted by impact`}>
        <ul className="divide-y divide-neutral-200">
          {negatives.map((g) => (
            <InboxRow key={`${g.sku}-${g.sub_channel}-${g.period}`} gap={g} meta={meta} />
          ))}
        </ul>
      </Section>

      {positives.length > 0 && (
        <Section title="Tailwinds" subtitle="Ahead of plan — protect, don't disturb">
          <ul className="divide-y divide-neutral-200">
            {positives.map((g) => (
              <InboxRow key={`${g.sku}-${g.sub_channel}-${g.period}-pos`} gap={g} meta={meta} positive />
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function Section({
  title, subtitle, children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">{title}</h3>
        <div className="text-[11.5px] text-neutral-500">{subtitle}</div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">{children}</div>
    </section>
  )
}

function InboxRow({ gap, meta, positive: _positive }: { gap: GapItem; meta: Meta; positive?: boolean }) {
  const tone = gapTone(gap.gap_pct)
  const badgeVariant =
    tone === "negative" ? "negative" : tone === "positive" ? "positive" : tone === "warn" ? "warn" : "outline"
  const href = `/decision/${encodeURIComponent(gap.sku)}/${encodeURIComponent(
    gap.sub_channel,
  )}?period=${encodeURIComponent(gap.period)}`

  return (
    <li>
      <Link
        href={href as Parameters<typeof Link>[0]["href"]}
        className="block px-4 py-3 hover:bg-neutral-50 transition-colors group"
      >
        <div className="flex items-center gap-4">
          <div className="w-20 shrink-0">
            <Badge variant={badgeVariant} className="text-[11px] px-2 py-0.5">
              {formatPercent(gap.gap_pct, 0)}
            </Badge>
            <div className="text-[10px] text-neutral-500 tabular-nums mt-0.5">
              {formatHl(gap.gap_hl)}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-neutral-900 truncate">
              {skuLabel(meta, gap.sku)}
            </div>
            <div className="text-[11.5px] text-neutral-500 truncate mt-0.5">
              {channelLabel(meta, gap.sub_channel)} · {formatPeriod(gap.period)} · forecast {formatHl(gap.forecast_hl)} vs target {formatHl(gap.budget_hl)}
            </div>
          </div>

          <div className="hidden md:block">
            <Badge variant="outline" className="capitalize">
              {gap.confidence}
            </Badge>
          </div>

          <div className="text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    </li>
  )
}

function SummaryTile({
  label, value, unit, icon, tone,
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
  tone?: "negative" | "positive" | "neutral"
}) {
  const color =
    tone === "negative" ? "var(--negative)" : tone === "positive" ? "var(--positive)" : "#171717"
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-neutral-500 font-medium">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <div className="text-xl font-semibold tabular-nums tracking-tight" style={{ color }}>
          {value}
        </div>
        {unit && <div className="text-[11px] text-neutral-500">{unit}</div>}
      </div>
    </div>
  )
}

function InboxSkeleton() {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px]" />)}
      </div>
      <div className="mt-8">
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-neutral-200 last:border-0">
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
