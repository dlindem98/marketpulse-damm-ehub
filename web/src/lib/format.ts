/**
 * Number + period formatters shared across pages.
 * Keep formats consistent: a Commercial Manager scans these dozens of times a day,
 * inconsistency = cognitive load.
 */

export const formatHl = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k Hl`
  return `${v.toFixed(0)} Hl`
}

export const formatPercent = (v: number | null | undefined, decimals = 1): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${(v * 100).toFixed(decimals)}%`
}

export const formatGBP = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `£${(v / 1000).toFixed(1)}k`
  return `£${v.toFixed(0)}`
}

export const formatPeriod = (period: string): string => {
  // "2026-11" → "Nov 2026"
  if (!period || !period.includes("-")) return period
  const [y, m] = period.split("-")
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return period
  return `${months[idx]} ${y}`
}

export const formatPeriodShort = (period: string): string => {
  // "2026-11" → "Nov '26"
  if (!period || !period.includes("-")) return period
  const [y, m] = period.split("-")
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return period
  return `${months[idx]} '${y.slice(2)}`
}

/**
 * Diverging color scale for gap percentages.
 * −10% or worse → red; 0 → neutral; +10% or better → green.
 * Used for chip backgrounds and chart cells.
 */
export const gapColor = (gapPct: number): string => {
  if (gapPct <= -0.05) return "var(--negative)"
  if (gapPct <= -0.01) return "var(--warn)"
  if (gapPct >= 0.05) return "var(--positive)"
  return "var(--neutral)"
}

export const gapTone = (gapPct: number): "negative" | "warn" | "neutral" | "positive" => {
  if (gapPct <= -0.05) return "negative"
  if (gapPct <= -0.01) return "warn"
  if (gapPct >= 0.05) return "positive"
  return "neutral"
}
