/**
 * Upcoming customer calls — fully faked calendar.
 *
 * Ramp's user works in upcoming-meeting cycles, not flat gap lists. The Inbox
 * organises by customer call: prep for the next 4 meetings, filter the action
 * queue to one customer at a time. There is no real calendar integration —
 * this module is the single source of truth for both the UpcomingCalls strip
 * and the CustomerFilter pill bar.
 *
 * Sub-channel mapping reality check
 * ---------------------------------
 * The backend's /api/meta returns 6 sub-channels that DON'T split grocery by
 * retailer:
 *   ["CONVENIENCE & WHOLESALE","FREE TRADE","FREE TRADE CMBC","GROCERY",
 *    "MDD COPACKING","NATIONAL ON TRADE"]
 *
 * So Trolley King / Crown Larder / Asda / Morrisons all live in the same GROCERY
 * bucket on the backend — we can't honestly split a gap row across them.
 *
 * For the demo we still want a per-grocer filter (the call-prep story
 * requires it). We pretend each grocer "owns" a deterministic slice of the
 * GROCERY rows via a stable hash on (sku, period). The split is fake but
 * stable: the same row always lands in the same grocer's bucket, so pill
 * counts and the filtered Action Queue agree. On-trade maps to the two
 * on-trade sub-channels honestly (no fake split needed).
 *
 * If the backend grows real grocer-level sub-channels later, replace
 * grocerSlice() with a direct sub_channel match.
 */

export type Customer = "tesco" | "sainsburys" | "asda" | "morrisons" | "on_trade"

export type UpcomingCall = {
  customer: Customer
  customer_label: string
  date_iso: string
  days_from_now: number
  attendees?: string
  /** Incremental hL secured at the meeting. Present iff the meeting is past. */
  outcome_hl?: number
}

export const CUSTOMER_LABELS: Record<Customer, string> = {
  tesco: "Trolley King",
  sainsburys: "Crown Larder",
  asda: "Big Aida",
  morrisons: "Borough & Sons",
  on_trade: "On-trade",
}

/** Grocers that share the GROCERY sub-channel — order defines the hash slice. */
const GROCERS: Customer[] = ["tesco", "sainsburys", "asda", "morrisons"]

/**
 * Sub-channels owned outright by a customer. Grocers don't appear here — they
 * all share GROCERY and are disambiguated by grocerSlice() below.
 */
const CUSTOMER_DIRECT_SUBCHANNELS: Partial<Record<Customer, string[]>> = {
  on_trade: ["NATIONAL ON TRADE", "FREE TRADE"],
}

/** Backwards-compat shape for callers that want a plain sub-channel list. */
export const CUSTOMER_TO_SUBCHANNELS: Record<Customer, string[]> = {
  tesco: ["GROCERY"],
  sainsburys: ["GROCERY"],
  asda: ["GROCERY"],
  morrisons: ["GROCERY"],
  on_trade: ["NATIONAL ON TRADE", "FREE TRADE"],
}

/** Deterministic 32-bit hash (FNV-1a). Stable across server + client renders. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** Which grocer "owns" a given GROCERY row. Pure function of (sku, period). */
function grocerOwner(sku: string, period: string): Customer {
  const idx = fnv1a(`${sku}|${period}`) % GROCERS.length
  return GROCERS[idx]
}

export type GapLike = { sku: string; sub_channel: string; period: string }

/**
 * True if a gap row belongs to the given customer's call-prep view.
 * Use this as a single predicate everywhere (pill counts, action-queue filter,
 * per-card stats on the UpcomingCalls strip).
 */
export function gapMatchesCustomer(gap: GapLike, customer: Customer): boolean {
  const direct = CUSTOMER_DIRECT_SUBCHANNELS[customer]
  if (direct && direct.includes(gap.sub_channel)) return true
  if (gap.sub_channel === "GROCERY" && GROCERS.includes(customer)) {
    return grocerOwner(gap.sku, gap.period) === customer
  }
  return false
}

/** Narrow an unknown string to a Customer, or null. */
export function asCustomer(s: string | null | undefined): Customer | null {
  if (!s) return null
  if (s in CUSTOMER_LABELS) return s as Customer
  return null
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Hardcoded call list — past + upcoming. Dates are computed at module load
 * so the demo always looks "live". Past entries (negative days_from_now)
 * carry an `outcome_hl` for the calendar chip's "+ hL won" footer.
 */
export const UPCOMING_CALLS: UpcomingCall[] = [
  // Past — completed meetings with realised lift
  {
    customer: "morrisons",
    customer_label: "Borough & Sons",
    date_iso: daysFromNow(-18),
    days_from_now: -18,
    outcome_hl: 310,
  },
  {
    customer: "asda",
    customer_label: "Big Aida",
    date_iso: daysFromNow(-12),
    days_from_now: -12,
    outcome_hl: 240,
  },
  {
    customer: "sainsburys",
    customer_label: "Crown Larder",
    date_iso: daysFromNow(-9),
    days_from_now: -9,
    outcome_hl: 95,
  },
  {
    customer: "on_trade",
    customer_label: "On-trade",
    date_iso: daysFromNow(-6),
    days_from_now: -6,
    outcome_hl: 180,
    attendees: "Hop House Q3 review",
  },
  {
    customer: "tesco",
    customer_label: "Trolley King",
    date_iso: daysFromNow(-3),
    days_from_now: -3,
    outcome_hl: 420,
  },
  // Upcoming
  {
    customer: "tesco",
    customer_label: "Trolley King",
    date_iso: daysFromNow(2),
    days_from_now: 2,
    attendees: "Lager category buyer",
  },
  {
    customer: "sainsburys",
    customer_label: "Crown Larder",
    date_iso: daysFromNow(3),
    days_from_now: 3,
  },
  {
    customer: "asda",
    customer_label: "Big Aida",
    date_iso: daysFromNow(5),
    days_from_now: 5,
  },
  {
    customer: "on_trade",
    customer_label: "On-trade",
    date_iso: daysFromNow(6),
    days_from_now: 6,
    attendees: "Maze Taverns JBR review",
  },
]
