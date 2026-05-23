/**
 * /brief/[customer] — Dia-style meeting brief for a customer call.
 *
 * Server Component. Pulls gaps + meta on the server, filters to this
 * customer's basket via the same `gapMatchesCustomer` logic the inbox
 * uses, then POSTs to /api/brief with the structured input. The
 * backend's LLM call synthesises the prose pieces (headline, push-
 * forward title/body, per-SKU asks) and we render the page from the
 * structured JSON.
 *
 * Layout inspired by Dia's Friday Brief: a single editorial document
 * with framed sections. No interactivity beyond Print/Copy.
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer, Copy, ExternalLink } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { serverFetch } from "@/lib/api"
import {
  asCustomer,
  UPCOMING_CALLS,
  CUSTOMER_LABELS,
  gapMatchesCustomer,
  type Customer,
} from "@/lib/calls"
import { skuLabel, channelLabel } from "@/lib/meta"
import { formatHl, formatPercent, formatPeriod, formatRelative } from "@/lib/format"
import type { components } from "@/lib/api.gen"

import { BriefActions } from "./brief-actions"
import { BriefHistoryTracker } from "./brief-history-tracker"

type GapItem = components["schemas"]["GapItem"]
type Meta = components["schemas"]["MetaResponse"]
type BriefResponse = components["schemas"]["BriefResponse"]
type BriefSkuInput = components["schemas"]["BriefSkuInput"]
type Driver = components["schemas"]["Driver"]

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function BriefPage({
  params,
}: {
  params: Promise<{ customer: string }>
}) {
  const { customer: rawCustomer } = await params
  const customer = asCustomer(rawCustomer)
  if (!customer) notFound()

  // 1. Pull gaps + meta (parallel).
  const [gaps, meta] = await Promise.all([
    serverFetch<GapItem[]>("/api/gap"),
    serverFetch<Meta>("/api/meta"),
  ])

  // 2. Filter to this customer's basket and rank worst-first. Keep top 5.
  const basket = gaps
    .filter((g) => g.gap_hl < 0 && gapMatchesCustomer(g, customer))
    .sort((a, b) => a.gap_pct - b.gap_pct)
    .slice(0, 5)

  // 3. Get the top SHAP driver per SKU (best-effort, parallel; failures
  //    just leave the driver blank — the brief still works).
  const topDrivers = await Promise.all(
    basket.map(async (g) => {
      try {
        const drivers = await serverFetch<Driver[]>(
          `/api/drivers?sku=${encodeURIComponent(g.sku)}&sub_channel=${encodeURIComponent(g.sub_channel)}`,
        )
        return drivers[0]?.feature ?? null
      } catch {
        return null
      }
    }),
  )

  // 4. Resolve the upcoming call for this customer (for the meeting date).
  const call = UPCOMING_CALLS.find((c) => c.customer === customer)
  const meetingDate = call ? new Date(call.date_iso) : new Date()
  const weekday = WEEKDAYS[meetingDate.getDay()]
  const daysAhead = call?.days_from_now ?? 0

  // 5. Build the brief request payload.
  const briefInput = {
    customer: CUSTOMER_LABELS[customer],
    customer_key: customer,
    meeting_weekday: weekday,
    meeting_in_days: daysAhead,
    skus: basket.map((g, i): BriefSkuInput => ({
      sku: g.sku,
      sub_channel: g.sub_channel,
      period: g.period,
      sku_label: skuLabel(meta, g.sku),
      gap_pct: g.gap_pct,
      gap_hl: g.gap_hl,
      top_driver: topDrivers[i],
    })),
  }

  // 6. Call the brief endpoint. Throws on backend error — that's loud
  //    on purpose; brief is a foreground action, no silent degradation.
  const brief = await serverFetch<BriefResponse>("/api/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(briefInput),
  })

  return (
    <PageContent className="h-full" contentWrapperClassName="min-h-0 overflow-y-auto">
      <BriefHistoryTracker
        customer={customer}
        customer_label={CUSTOMER_LABELS[customer]}
      />
      <PageWidthWrapper className="pt-2 pb-12 max-w-3xl">
        <BriefView brief={brief} customer={customer} call={call} />
      </PageWidthWrapper>
    </PageContent>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// View
// ──────────────────────────────────────────────────────────────────────────

function BriefView({
  brief,
  customer,
  call,
}: {
  brief: BriefResponse
  customer: Customer
  call: ReturnType<typeof UPCOMING_CALLS.find>
}) {
  const dateLine = call
    ? new Date(call.date_iso).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).toUpperCase()
    : "MEETING BRIEF"

  return (
    <article className="space-y-6">
      {/* Back + actions */}
      <header className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href="/brief"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All briefs
        </Link>
        <BriefActions />
      </header>

      {/* Editorial header */}
      <header className="border-b border-neutral-200 pb-6">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium mb-3">
          {dateLine} · {brief.meeting_label}
        </div>
        <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.02em] text-neutral-900">
          The {brief.customer} <span className="italic">Brief</span>
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-neutral-700">
          {brief.headline}
        </p>
      </header>

      {/* Push your work forward — the headline ask */}
      <Section label="Push your work forward">
        <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-5">
          <h3 className="font-serif text-[22px] leading-[1.2] tracking-tight text-neutral-900 mb-2">
            {brief.push_forward_title}
          </h3>
          <p className="text-[13.5px] leading-[1.6] text-neutral-700">
            {brief.push_forward_body}
          </p>
        </div>
      </Section>

      {/* Top SKUs to cover */}
      <Section label="Top SKUs to cover">
        <ol className="space-y-3">
          {brief.top_skus.map((s, i) => (
            <li
              key={`${s.sku_label}-${s.period}-${i}`}
              className="flex items-start gap-4"
            >
              <span className="text-[10.5px] tabular-nums text-neutral-400 font-medium mt-1 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-[14px] font-medium text-neutral-900 truncate">
                    {s.sku_label}
                  </h4>
                  <span
                    className={[
                      "text-[12px] tabular-nums font-semibold shrink-0",
                      s.gap_pct <= -0.25
                        ? "text-[color:var(--critical)]"
                        : "text-[color:var(--negative)]",
                    ].join(" ")}
                  >
                    {formatPercent(s.gap_pct, 0)} · {formatHl(s.gap_hl)}
                  </span>
                </div>
                <div className="text-[11.5px] text-neutral-500 mt-0.5">
                  {channelLabelShort(s.sub_channel)} · forecast for {formatPeriod(s.period)}
                  {s.top_driver && (
                    <>
                      {" · driver: "}
                      <span className="text-neutral-600">{s.top_driver}</span>
                    </>
                  )}
                </div>
                {s.recommended_ask && (
                  <div className="mt-1.5 text-[12.5px] text-neutral-700 leading-snug">
                    <span className="text-neutral-500">Ask: </span>{s.recommended_ask}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Market context — Tavily news */}
      {brief.market_context.length > 0 && (
        <Section label="Market context">
          <ol className="space-y-2.5">
            {brief.market_context.map((n, i) => (
              <li key={n.url} className="flex items-start gap-4">
                <span className="text-[10.5px] tabular-nums text-neutral-400 font-medium mt-1 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-start gap-1.5 text-[13px] font-medium text-neutral-900 hover:text-neutral-700 transition-colors"
                  >
                    <span>{n.title}</span>
                    <ExternalLink className="h-3 w-3 mt-1 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </a>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {n.source_domain}
                    {n.published_at && (
                      <>
                        {" · "}
                        <span className="tabular-nums">{formatRelative(n.published_at)}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Suggested agenda */}
      <Section label="Your agenda">
        <ul className="space-y-2 border-l border-neutral-200 pl-4">
          {brief.agenda.map((item, i) => (
            <li key={i} className="flex items-baseline gap-4">
              <span className="text-[11.5px] tabular-nums text-neutral-500 font-medium w-16 shrink-0">
                {item.time}
              </span>
              <span className="text-[13px] text-neutral-800">{item.title}</span>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium mb-3">
        {label}
      </div>
      {children}
    </section>
  )
}

// Trim verbose channel labels for the brief context — "Off-trade grocery" stays,
// "B2B distributor" stays, etc. (channelLabel from meta already handles this;
// keep it pass-through here in case we want to shorten further later.)
function channelLabelShort(sub_channel: string): string {
  const map: Record<string, string> = {
    GROCERY: "Off-trade grocery",
    "CONVENIENCE & WHOLESALE": "Convenience",
    "NATIONAL ON TRADE": "On-trade",
    "FREE TRADE": "Free trade",
    "FREE TRADE CMBC": "B2B distributor",
    "MDD COPACKING": "Copacking",
  }
  return map[sub_channel] ?? sub_channel
}
