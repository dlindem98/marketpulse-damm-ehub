/**
 * Triage Inbox — home base for a UK Commercial Manager.
 *
 * Layout shape:
 *   [ Welcome back, Sarah ]
 *   [ MonthCalendar — full-page hero, customer calls as day chips ]
 *
 * When the user clicks a call chip, `?customer=X` appears in the URL and
 * AtRiskDrawer pops up from the bottom showing the SKUs at risk for that
 * customer. The calendar stays visible behind a dim backdrop. Dismiss
 * removes the query param.
 */

import Link from "next/link"
import { Suspense } from "react"
import { ArrowRight, CornerDownRight, Package } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkline } from "@/components/ui/sparkline"
import { serverFetch } from "@/lib/api"
import { formatHl, formatPercent, gapTone, formatPeriod } from "@/lib/format"
import { skuLabel, channelLabel } from "@/lib/meta"
import {
  CUSTOMER_LABELS,
  UPCOMING_CALLS,
  asCustomer,
  gapMatchesCustomer,
  type Customer,
} from "@/lib/calls"
import { MonthCalendar } from "@/components/inbox/MonthCalendar"
import { AtRiskDrawer } from "@/components/inbox/AtRiskDrawer"
import type { components } from "@/lib/api.gen"

type GapItem = components["schemas"]["GapItem"]
type Meta = components["schemas"]["MetaResponse"]

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer: customerParam } = await searchParams
  const customer = asCustomer(customerParam)

  return (
    <PageContent
      className="h-full"
      contentWrapperClassName="min-h-0 flex flex-col"
    >
      <PageWidthWrapper className="flex-1 min-h-0 flex flex-col">
        <Suspense fallback={<InboxSkeleton />}>
          <Inbox customer={customer} />
        </Suspense>
      </PageWidthWrapper>
    </PageContent>
  )
}

async function Inbox({ customer }: { customer: Customer | null }) {
  const [gaps, meta] = await Promise.all([
    serverFetch<GapItem[]>("/api/gap"),
    serverFetch<Meta>("/api/meta"),
  ])

  // For the drawer — filter the at-risk SKUs to the active customer.
  const negatives = customer
    ? gaps
        .filter((g) => gapMatchesCustomer(g, customer) && g.gap_hl < 0)
        .sort((a, b) => a.gap_hl - b.gap_hl)
    : []

  // Prefer the soonest UPCOMING call for this customer — past meetings live
  // in the list too (for the calendar's "done" chips) and otherwise win the
  // `find` race because they sort earlier.
  const activeCall = customer
    ? UPCOMING_CALLS
        .filter((c) => c.customer === customer && c.days_from_now >= 0)
        .sort((a, b) => a.days_from_now - b.days_from_now)[0] ?? null
    : null

  return (
    <div className="h-full flex flex-col min-h-0 pb-2">
      <header className="shrink-0">
        <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.02em] text-neutral-900">
          Welcome back, Sarah
        </h1>
      </header>

      {/* Calendar is the entire page below the welcome line. */}
      <MonthCalendar gaps={gaps} activeCustomer={customer} />

      {/* Bottom-sheet drawer — only mounted when a customer is selected. */}
      {customer && (
        <AtRiskDrawer
          customerLabel={CUSTOMER_LABELS[customer]}
          customerKey={customer}
          daysFromNow={activeCall?.days_from_now ?? null}
          weekday={
            activeCall ? WEEKDAYS[new Date(activeCall.date_iso).getDay()] : null
          }
        >
          {negatives.length === 0 ? (
            <div className="py-10 text-center text-sm text-neutral-500">
              No gaps for this customer — they&apos;re on plan.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {negatives.map((g) => (
                <InboxRow
                  key={`${g.sku}-${g.sub_channel}-${g.period}`}
                  gap={g}
                  meta={meta}
                />
              ))}
            </ul>
          )}
        </AtRiskDrawer>
      )}
    </div>
  )
}

const TONE_PILL: Record<ReturnType<typeof gapTone>, string> = {
  critical: "border-[var(--critical)]/30 bg-[var(--critical)]/10 text-[var(--critical)]",
  bad:      "border-[var(--negative)]/30 bg-[var(--negative)]/10 text-[var(--negative)]",
  warn:     "border-[var(--warn)]/30 bg-[var(--warn)]/10 text-[var(--warn)]",
  good:     "border-[var(--positive)]/30 bg-[var(--positive)]/10 text-[var(--positive)]",
  neutral:  "border-neutral-200 bg-neutral-50 text-neutral-700",
}

const TONE_ICON: Record<ReturnType<typeof gapTone>, string> = {
  critical: "text-[var(--critical)]",
  bad:      "text-[var(--negative)]",
  warn:     "text-[var(--warn)]",
  good:     "text-[var(--positive)]",
  neutral:  "text-neutral-500",
}

function InboxRow({ gap, meta }: { gap: GapItem; meta: Meta }) {
  const tone = gapTone(gap.gap_pct)
  const href = `/decision/${encodeURIComponent(gap.sku)}/${encodeURIComponent(
    gap.sub_channel,
  )}?period=${encodeURIComponent(gap.period)}`

  return (
    <li>
      <Link
        href={href as Parameters<typeof Link>[0]["href"]}
        className="group block rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50/60"
      >
        <div className="flex items-center gap-4">
          {/* Left — circular SKU icon, dub-style ring with gradient */}
          <div className="relative size-9 shrink-0">
            <div className="absolute inset-0 rounded-full border border-neutral-200">
              <div className="h-full w-full rounded-full border border-white bg-gradient-to-t from-neutral-100" />
            </div>
            <div className="relative flex h-full w-full items-center justify-center">
              <Package className={`h-4 w-4 ${TONE_ICON[tone]}`} />
            </div>
          </div>

          {/* Middle — title + ↳ secondary */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold leading-6 text-neutral-800 group-hover:text-neutral-950">
              {skuLabel(meta, gap.sku)}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-neutral-500">
              <CornerDownRight className="h-3 w-3 shrink-0 text-neutral-400" />
              <span className="truncate">
                {channelLabel(meta, gap.sub_channel)} · forecast for {formatPeriod(gap.period)}
              </span>
            </div>
          </div>

          {/* Right — sparkline + gap pill + chevron */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:block">
              <Sparkline data={gap.history_hl ?? []} width={88} positive={gap.gap_hl > 0} />
            </div>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium tabular-nums ${TONE_PILL[tone]}`}
            >
              <span>{formatPercent(gap.gap_pct, 0)}</span>
              <span className="opacity-50">·</span>
              <span>{formatHl(gap.gap_hl)}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-neutral-700" />
          </div>
        </div>
      </Link>
    </li>
  )
}

function InboxSkeleton() {
  return (
    <div className="mt-2">
      <Skeleton className="h-10 w-80 mb-8" />
      <Skeleton className="h-6 w-40 mb-3" />
      <Skeleton className="flex-1 w-full rounded-xl" />
    </div>
  )
}
