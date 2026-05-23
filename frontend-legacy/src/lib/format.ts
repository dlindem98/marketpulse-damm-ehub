/**
 * Number, label, period formatters + Dub-aligned color tokens.
 *
 * Color rules (Dub.co):
 *  - UI chrome is monochrome (gray scale)
 *  - Color is RESERVED for value encoding only:
 *      green   = positive / above target
 *      red     = negative / below target
 *      blue    = neutral primary metric
 *      gray    = no data / inactive
 */

const ENG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const SPA_TO_NUM: Record<string, number> = {
  Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6,
  Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12,
}

export function formatHl(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M Hl`
  if (Math.abs(value) >= 1_000) return `${Math.round(value).toLocaleString()} Hl`
  if (Math.abs(value) >= 10) return `${Math.round(value)} Hl`
  if (Math.abs(value) >= 1) return `${value.toFixed(1)} Hl`
  return "<1 Hl"
}

export function formatHlPlain(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1000).toFixed(1)}k`
  if (Math.abs(value) >= 1) return value.toFixed(1)
  return "<1"
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${Math.abs(value * 100).toFixed(decimals)}%`
}

export function formatGBP(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `£${(value / 1000).toFixed(1)}k`
  return `£${Math.round(value).toLocaleString()}`
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "—"
  const p = period.trim()
  if (p.includes(".") && p.split(".").length === 2) {
    const [m, y] = p.split(".")
    const num = SPA_TO_NUM[m.slice(0, 3)]
    if (num && /^\d+$/.test(y)) {
      const year = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10)
      return `${ENG_MONTHS[num - 1]} ${year}`
    }
  }
  if (p.includes("-")) {
    const parts = p.split("-")
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    if (year && month >= 1 && month <= 12) return `${ENG_MONTHS[month - 1]} ${year}`
  }
  return p
}

export function formatPeriodShort(period: string | null | undefined): string {
  if (!period) return "—"
  const p = period.trim()
  if (p.includes(".")) {
    const [m, y] = p.split(".")
    const num = SPA_TO_NUM[m.slice(0, 3)]
    if (num && /^\d+$/.test(y)) return `${ENG_MONTHS[num - 1].slice(0, 3)} ${y}`
  }
  if (p.includes("-")) {
    const parts = p.split("-")
    const month = parseInt(parts[1], 10)
    const year = parseInt(parts[0], 10)
    if (year && month >= 1 && month <= 12) {
      return `${ENG_MONTHS[month - 1].slice(0, 3)} ${String(year).slice(2)}`
    }
  }
  return p
}

/**
 * Dub-style diverging color for any signed delta.
 * Returns CSS variable references where possible so dark/light modes
 * pick up the right tone automatically.
 */
export function gapColor(gapPct: number | null | undefined): string {
  if (gapPct === null || gapPct === undefined || Number.isNaN(gapPct)) return "#71717a"
  if (gapPct <= -0.05) return "#dc2626" // red-600
  if (gapPct <= -0.02) return "#ea580c" // orange-600
  if (gapPct < 0.02) return "#71717a"   // zinc-500
  if (gapPct < 0.05) return "#65a30d"   // lime-600
  return "#16a34a"                       // green-600
}

export function gapBadgeVariant(gapPct: number | null | undefined): "destructive" | "secondary" | "default" {
  if (gapPct === null || gapPct === undefined) return "secondary"
  if (gapPct < -0.02) return "destructive"
  if (gapPct > 0.02) return "default"
  return "secondary"
}

export function gapLabel(gapPct: number | null | undefined): string {
  if (gapPct === null || gapPct === undefined) return "—"
  if (gapPct < -0.10) return "Major shortfall"
  if (gapPct < -0.05) return "Below target"
  if (gapPct < -0.02) return "Slightly below"
  if (gapPct < 0.02) return "On target"
  if (gapPct < 0.05) return "Above target"
  return "Strongly above"
}
