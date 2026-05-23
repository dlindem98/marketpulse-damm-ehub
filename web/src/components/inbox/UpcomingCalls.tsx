/**
 * UpcomingCalls — 7-day week grid showing customer meetings.
 *
 * Server component. Receives gaps already fetched by the parent inbox so we
 * don't hit /api/gap twice. Renders a 7-column grid covering today + the
 * next 6 days; each call drops into the column matching its `days_from_now`.
 *
 *   Today | +1 | +2 | +3 | +4 | +5 | +6
 *   ─────────────────────────────────────
 *   Mon23 | Tu | We | Th | Fr | Sa | Su   ← day headers, today highlighted
 *   ─────────────────────────────────────
 *         |    │Tesco│   │Sains│   │Asda│ ← call event blocks
 *
 * Calendar cards are deliberately quiet — single-stat summary (X SKUs at risk)
 * plus a "Generate brief" CTA. Click the body of the card → filters the
 * at-risk list below. Click the brief CTA → goes to /brief/[customer].
 *
 * To allow two click targets without nesting anchors, the card uses the
 * "card with overlay link" pattern: the body link is an absolutely-positioned
 * overlay; the brief link sits above it on z-axis.
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  UPCOMING_CALLS,
  type Customer,
  type UpcomingCall,
  gapMatchesCustomer,
  type GapLike,
} from "@/lib/calls"

type GapForStats = GapLike & { gap_hl: number; gap_pct: number }

const DAYS_AHEAD = 7
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

// Card sizing modes:
//  - `compact` (a customer is selected): fixed 360px so the at-risk panel
//    below has room to breathe.
//  - `expanded` (no customer selected): cards fill remaining viewport via
//    h-full + the parent's flex-1 — calendar becomes the whole page.
const COMPACT_HEIGHT = "h-[360px]"
const EXPANDED_HEIGHT = "h-full min-h-[360px]"

function statsFor(gaps: GapForStats[], customer: Customer) {
  const mine = gaps.filter((g) => gapMatchesCustomer(g, customer) && g.gap_hl < 0)
  const critical = mine.filter((g) => g.gap_pct <= -0.25).length
  return { total: mine.length, critical }
}

type Day = {
  index: number
  date: Date
  isToday: boolean
  call: UpcomingCall | null
}

function buildDays(): Day[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const callByOffset = new Map<number, UpcomingCall>()
  for (const c of UPCOMING_CALLS) {
    if (c.days_from_now >= 0 && c.days_from_now < DAYS_AHEAD) {
      callByOffset.set(c.days_from_now, c)
    }
  }

  const days: Day[] = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push({
      index: i,
      date: d,
      isToday: i === 0,
      call: callByOffset.get(i) ?? null,
    })
  }
  return days
}

export function UpcomingCalls({
  gaps,
  activeCustomer,
  expanded = false,
}: {
  gaps: GapForStats[]
  activeCustomer: Customer | null
  /** When true, cards fill available vertical space (no customer selected
   *  — calendar is the whole page). When false, cards use a fixed compact
   *  height so the at-risk panel below has room. */
  expanded?: boolean
}) {
  const days = buildDays()
  const cardHeightClass = expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT

  return (
    <section
      className={[
        "mt-8 flex flex-col",
        expanded ? "flex-1 min-h-0" : "",
      ].join(" ")}
      aria-label="This week's customer calls"
    >
      <div className="mb-5 shrink-0">
        <h3 className="text-[13px] font-semibold text-neutral-900">This week</h3>
      </div>

      {/* Day-header row — single continuous border under all 7 weekdays */}
      <div className="grid grid-cols-7 border-b border-neutral-200 pb-3 mb-3 shrink-0">
        {days.map((day) => (
          <div key={day.index} className="px-1.5 min-w-0">
            <DayHeader date={day.date} isToday={day.isToday} />
          </div>
        ))}
      </div>

      {/* Call cards row */}
      <div
        className={[
          "grid grid-cols-7 gap-2.5",
          expanded ? "flex-1 min-h-0" : "",
        ].join(" ")}
      >
        {days.map((day) => (
          <DayCell
            key={day.index}
            day={day}
            gaps={gaps}
            activeCustomer={activeCustomer}
            cardHeightClass={cardHeightClass}
          />
        ))}
      </div>
    </section>
  )
}

function DayCell({
  day,
  gaps,
  activeCustomer,
  cardHeightClass,
}: {
  day: Day
  gaps: GapForStats[]
  activeCustomer: Customer | null
  cardHeightClass: string
}) {
  return (
    <div className="min-w-0 flex flex-col">
      {day.call ? (
        <CallCard
          call={day.call}
          gaps={gaps}
          isActive={activeCustomer === day.call.customer}
          cardHeightClass={cardHeightClass}
        />
      ) : (
        <div className={`${cardHeightClass} rounded-xl bg-neutral-50/60`} aria-hidden />
      )}
    </div>
  )
}

function DayHeader({ date, isToday }: { date: Date; isToday: boolean }) {
  const dayName = DAY_NAMES[date.getDay()]
  const dayNum = date.getDate()

  return (
    <div className="flex items-baseline gap-2">
      <span
        className={[
          "text-[11.5px] uppercase tracking-wider",
          isToday ? "text-neutral-900 font-semibold" : "text-neutral-500 font-medium",
        ].join(" ")}
      >
        {dayName}
      </span>
      <span
        className={[
          "text-[16px] tabular-nums",
          isToday ? "text-neutral-900 font-semibold" : "text-neutral-400 font-medium",
        ].join(" ")}
      >
        {dayNum}
      </span>
      {isToday && (
        <span className="ml-auto text-[9.5px] uppercase tracking-wider font-medium text-neutral-500">
          Today
        </span>
      )}
    </div>
  )
}

function CallCard({
  call,
  gaps,
  isActive,
  cardHeightClass,
}: {
  call: UpcomingCall
  gaps: GapForStats[]
  isActive: boolean
  cardHeightClass: string
}) {
  const { total, critical } = statsFor(gaps, call.customer)
  const filterHref = `/?customer=${call.customer}` as const
  const briefHref = `/brief/${call.customer}` as const

  return (
    <div
      aria-current={isActive ? "true" : undefined}
      className={[
        "group relative flex flex-col rounded-xl border bg-white px-4 py-4 transition-all min-w-0",
        cardHeightClass,
        isActive
          ? "border-neutral-900 shadow-xs"
          : "border-neutral-200 hover:border-neutral-300 hover:shadow-xs",
      ].join(" ")}
    >
      {/* Overlay link covers the whole card → filter the at-risk list. The
          Brief link below has higher z-index so it doesn't trigger this. */}
      <Link
        href={filterHref}
        aria-label={`Filter at-risk SKUs for ${call.customer_label}`}
        className="absolute inset-0 z-10 rounded-xl"
      />

      {/* Header: customer name + critical-count pill */}
      <div className="relative z-0 flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isActive && (
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-900 shrink-0"
              />
            )}
            <span className="text-[17px] font-semibold text-neutral-900 truncate leading-tight">
              {call.customer_label}
            </span>
          </div>
          {call.attendees && (
            <div className="text-[11px] text-neutral-500 mt-1 truncate">
              {call.attendees}
            </div>
          )}
        </div>
        {critical > 0 && (
          <span
            className="inline-flex items-center rounded-md bg-[color:var(--critical-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--critical)] uppercase tracking-wide tabular-nums shrink-0"
            title={`${critical} critical gap${critical === 1 ? "" : "s"} (≤ -25%)`}
          >
            {critical} crit
          </span>
        )}
      </div>

      {/* Big stat — the visual anchor of the card. Lots of breathing room. */}
      <div className="relative z-0 flex-1 flex flex-col justify-center min-w-0">
        {total > 0 ? (
          <>
            <div className="text-[48px] font-semibold tabular-nums text-neutral-900 leading-none tracking-[-0.02em]">
              {total}
            </div>
            <div className="text-[12.5px] text-neutral-500 mt-2.5">
              SKU{total === 1 ? "" : "s"} at risk
            </div>
          </>
        ) : (
          <div className="text-[12px] text-neutral-400">On plan — no gaps</div>
        )}
      </div>

      {/* Generate brief CTA — own Link, z-20 so it sits above the overlay.
          Full-width button-style so the call to action is clearly clickable. */}
      <Link
        href={briefHref}
        className="relative z-20 inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 text-white text-[12px] font-medium py-2.5 hover:bg-neutral-800 transition-colors mt-2"
      >
        Generate brief
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
