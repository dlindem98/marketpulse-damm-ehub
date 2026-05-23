/**
 * MonthCalendar — real month grid (Google Calendar / Cron / Notion Calendar
 * shape) covering the current month, with customer calls dropped into their
 * day cells as chips.
 *
 * Server component. Receives gaps + the active customer (from URL), computes
 * the month's day grid + per-customer stats deterministically, and renders
 * a 7-column grid. Each day cell is roughly square — much better proportions
 * than the prior tall week-strip cards.
 *
 *   [Mon | Tue | Wed | Thu | Fri | Sat | Sun]
 *   [  · |  · |  · |  · |  · |  · |  · ]   ← prev-month spillover (muted)
 *   [  1 |  2 |  3 |  4 |  5 |  6 |  7 ]
 *   [  8 |  9 | 10 | 11 | 12·t| 13 | 14 ]   ← Tesco call on the 12th
 *   [ 15 | 16 | 17 | 18 | 19 | 20 | 21 ]
 *
 * Call chips are <Link> elements that filter via ?customer=X. The at-risk
 * drawer in page.tsx pops open when that param is present.
 */

import Link from "next/link"
import {
  UPCOMING_CALLS,
  type Customer,
  type UpcomingCall,
  gapMatchesCustomer,
  type GapLike,
} from "@/lib/calls"
import { formatHl } from "@/lib/format"

type GapForStats = GapLike & { gap_hl: number; gap_pct: number }

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

type DayCell = {
  date: Date
  inMonth: boolean
  isToday: boolean
  calls: UpcomingCall[]
}

/** Build the month's grid as a flat array of cells (always multiple of 7).
 *  Starts on Monday — covers the days of the month plus prev/next-month
 *  spillover to fill the weekly rows. */
function buildMonthGrid(today: Date): DayCell[] {
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  const year = t.getFullYear()
  const month = t.getMonth()

  // First of the month → back up to the most-recent Monday.
  const first = new Date(year, month, 1)
  const dowMon = (first.getDay() + 6) % 7 // 0 = Mon, 6 = Sun
  const gridStart = new Date(year, month, 1 - dowMon)

  // Last of the month → forward to the next Sunday.
  const last = new Date(year, month + 1, 0)
  const dowMonLast = (last.getDay() + 6) % 7
  const gridEnd = new Date(year, month + 1, (6 - dowMonLast))

  // Index calls by ISO date for O(1) lookup.
  const callsByDate = new Map<string, UpcomingCall[]>()
  for (const c of UPCOMING_CALLS) {
    const key = c.date_iso
    if (!callsByDate.has(key)) callsByDate.set(key, [])
    callsByDate.get(key)!.push(c)
  }

  const cells: DayCell[] = []
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const dt = new Date(d)
    const iso = dt.toISOString().slice(0, 10)
    cells.push({
      date: dt,
      inMonth: dt.getMonth() === month,
      isToday: dt.getTime() === t.getTime(),
      calls: callsByDate.get(iso) ?? [],
    })
  }
  return cells
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function statsFor(gaps: GapForStats[], customer: Customer) {
  const mine = gaps.filter((g) => gapMatchesCustomer(g, customer) && g.gap_hl < 0)
  const critical = mine.filter((g) => g.gap_pct <= -0.25).length
  return { total: mine.length, critical }
}

export function MonthCalendar({
  gaps,
  activeCustomer,
}: {
  gaps: GapForStats[]
  activeCustomer: Customer | null
}) {
  const today = new Date()
  const cells = buildMonthGrid(today)

  return (
    <section
      className="flex-1 min-h-0 flex flex-col"
      aria-label="Customer call calendar"
    >
      {/* Compact header — page-level "May 2026" sits at the top of the
          dashboard, so this just labels the calendar as a section. */}
      <div className="mb-3 shrink-0">
        <h3 className="text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
          Customer calls
        </h3>
      </div>

      {/* Day-of-week header strip */}
      <div className="grid grid-cols-7 border-b border-neutral-200 pb-2 mb-2 shrink-0">
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={[
              "px-2 text-[10.5px] uppercase tracking-wider font-medium",
              // Weekend columns slightly muted for visual rhythm.
              i >= 5 ? "text-neutral-400" : "text-neutral-500",
            ].join(" ")}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Month grid — each row of 7 stretches to fill remaining viewport. */}
      <div
        className="grid grid-cols-7 gap-px bg-neutral-200 rounded-xl overflow-hidden flex-1 min-h-0"
        style={{ gridAutoRows: "minmax(0, 1fr)" }}
      >
        {cells.map((cell, i) => (
          <DayCellView
            key={i}
            cell={cell}
            gaps={gaps}
            activeCustomer={activeCustomer}
          />
        ))}
      </div>
    </section>
  )
}

function DayCellView({
  cell,
  gaps,
  activeCustomer,
}: {
  cell: DayCell
  gaps: GapForStats[]
  activeCustomer: Customer | null
}) {
  return (
    <div
      className={[
        "relative p-2 flex flex-col gap-1.5 min-h-0 min-w-0",
        cell.inMonth ? "bg-white" : "bg-neutral-50/70",
      ].join(" ")}
    >
      {/* Day number, top-left. Today is a circular highlight. */}
      <div className="flex items-baseline gap-1 shrink-0">
        {cell.isToday ? (
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-neutral-900 text-white text-[11px] font-semibold tabular-nums">
            {cell.date.getDate()}
          </span>
        ) : (
          <span
            className={[
              "text-[11.5px] tabular-nums",
              cell.inMonth ? "text-neutral-700" : "text-neutral-300",
              cell.inMonth && cell.date.getDay() === 0 ? "text-neutral-400" : "",
            ].join(" ")}
          >
            {cell.date.getDate()}
          </span>
        )}
      </div>

      {/* Call chips — stack vertically inside the cell. */}
      {cell.calls.length > 0 && (
        <div className="flex flex-col gap-1 min-w-0">
          {cell.calls.map((call) => {
            const { total, critical } = statsFor(gaps, call.customer)
            const isActive = activeCustomer === call.customer
            const isPast = call.outcome_hl !== undefined

            // Past meetings are inert — no link, no hover, faded surface.
            // Acting on the past isn't useful; the chip is just an audit trail.
            if (isPast) {
              return (
                <div
                  key={call.customer}
                  aria-disabled="true"
                  className="flex flex-col gap-0.5 rounded-md border border-dashed border-neutral-200 bg-white px-1.5 py-1 text-left min-w-0 opacity-70"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden
                      className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-[color:var(--positive-soft)] text-[8px] leading-none text-[color:var(--positive)] shrink-0"
                    >
                      ✓
                    </span>
                    <span className="text-[11px] font-medium truncate flex-1 min-w-0 text-neutral-500 line-through decoration-neutral-300">
                      {call.customer_label}
                    </span>
                  </div>
                  <div className="text-[10px] tabular-nums truncate text-[color:var(--positive)]">
                    +{formatHl(call.outcome_hl!)} won
                  </div>
                </div>
              )
            }

            const surface = isActive
              ? "bg-neutral-900 text-white"
              : critical > 0
                ? "bg-[color:var(--critical-soft)] text-[color:var(--critical)] hover:brightness-95"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"

            const dotColor = isActive
              ? "bg-white"
              : critical > 0
                ? "bg-[color:var(--critical)]"
                : "bg-neutral-400"

            const footerColor = isActive ? "text-white/70" : "text-neutral-500"
            const href = `/?customer=${call.customer}` as const

            return (
              <Link
                key={call.customer}
                href={href}
                aria-current={isActive ? "true" : undefined}
                className={`group flex flex-col gap-0.5 rounded-md px-1.5 py-1 text-left transition-all min-w-0 ${surface}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`}
                  />
                  <span className="text-[11px] font-semibold truncate flex-1 min-w-0">
                    {call.customer_label}
                  </span>
                  <span className="text-[10px] tabular-nums shrink-0 opacity-80">
                    {total}
                  </span>
                </div>
                <div className={`text-[10px] tabular-nums truncate ${footerColor}`}>
                  {total > 0 ? `${total} at risk` : "On plan"}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
