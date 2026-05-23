/**
 * Triage Inbox — the home base for a UK Commercial Manager.
 *
 * WHY THIS IS THE ENTRY POINT (and not a dashboard):
 * A Commercial Manager doesn't open the app to admire numbers. They open it
 * with a job: "which grocer call do I prep for this week, and what's my ask?"
 * A dashboard answers "how are we doing." A worklist answers "what should I do."
 *
 * Each row is a unit of work:
 *   - SKU × Sub-channel × Period  (the thing to act on)
 *   - Gap to budget                (red = behind, severity color-coded)
 *   - One-line headline            (derived; full LLM narrative on the decision page)
 *   - Confidence pill              (deprioritize low-confidence rows)
 *   - "Open" → /decision/...       (opens the full flow)
 *
 * Rows are sorted by absolute gap volume (Hl) — biggest commercial impact first.
 * A 200-Hl miss on a hero SKU matters more than a 30-Hl miss on a tail SKU even
 * if the % gap is bigger on the tail. That's the right default.
 */

import Link from "next/link"
import { Suspense } from "react"
import { ArrowRight, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
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
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">This week&apos;s decisions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          UK SKUs ranked by gap to target. Open a row to diagnose, choose an action, and simulate it.
        </p>
      </header>

      <Suspense fallback={<InboxSkeleton />}>
        <Inbox />
      </Suspense>
    </div>
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
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryTile
          label="Behind target"
          value={`${negCount} rows`}
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
          value={`${positives.length} rows`}
          icon={<TrendingUp className="h-3.5 w-3.5 text-[color:var(--positive)]" />}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <div className="text-[12px] font-medium">Action queue</div>
          <div className="text-[11px] text-muted-foreground">{negatives.length} items · sorted by impact</div>
        </div>
        <ul className="divide-y divide-border">
          {negatives.map((g) => (
            <InboxRow key={`${g.sku}-${g.sub_channel}-${g.period}`} gap={g} meta={meta} />
          ))}
        </ul>
      </Card>

      {positives.length > 0 && (
        <Card className="overflow-hidden mt-4">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <div className="text-[12px] font-medium">Tailwinds</div>
            <div className="text-[11px] text-muted-foreground">Ahead of plan — protect, don&apos;t disturb</div>
          </div>
          <ul className="divide-y divide-border">
            {positives.map((g) => (
              <InboxRow key={`${g.sku}-${g.sub_channel}-${g.period}-pos`} gap={g} meta={meta} positive />
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function InboxRow({ gap, meta, positive }: { gap: GapItem; meta: Meta; positive?: boolean }) {
  const tone = gapTone(gap.gap_pct)
  const badgeVariant =
    tone === "negative" ? "negative" : tone === "positive" ? "positive" : tone === "warn" ? "warn" : "outline"
  const headline = buildHeadline(gap, positive)
  const href = `/decision/${encodeURIComponent(gap.sku)}/${encodeURIComponent(
    gap.sub_channel,
  )}?period=${encodeURIComponent(gap.period)}`

  return (
    <li>
      <Link
        href={href as Parameters<typeof Link>[0]["href"]}
        className="block px-4 py-3 hover:bg-accent/50 transition group"
      >
        <div className="flex items-center gap-4">
          <div className="w-20 shrink-0">
            <Badge variant={badgeVariant} className="text-[11px] px-2 py-0.5">
              {formatPercent(gap.gap_pct, 0)}
            </Badge>
            <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
              {formatHl(gap.gap_hl)}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{skuLabel(meta, gap.sku)}</div>
            <div className="text-[11.5px] text-muted-foreground truncate">
              {channelLabel(meta, gap.sub_channel)} · {formatPeriod(gap.period)} · {headline}
            </div>
          </div>

          <div className="hidden md:block">
            <Badge variant="outline" className="capitalize">
              {gap.confidence}
            </Badge>
          </div>

          <div className="text-muted-foreground group-hover:text-foreground transition shrink-0">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    </li>
  )
}

function SummaryTile({
  label, value, icon, tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone?: "negative" | "positive" | "neutral"
}) {
  const color =
    tone === "negative" ? "var(--negative)" : tone === "positive" ? "var(--positive)" : "var(--foreground)"
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums tracking-tight mt-1" style={{ color }}>
        {value}
      </div>
    </Card>
  )
}

function buildHeadline(g: GapItem, positive?: boolean): string {
  const pct = Math.abs(g.gap_pct * 100).toFixed(0)
  const dir = positive ? "ahead" : "behind"
  return `${pct}% ${dir} · forecast ${formatHl(g.forecast_hl)} vs target ${formatHl(g.budget_hl)}`
}

function InboxSkeleton() {
  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px]" />)}
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
