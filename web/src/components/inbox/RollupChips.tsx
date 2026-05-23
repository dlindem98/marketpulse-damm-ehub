/**
 * RollupChips — horizontal user-scrollable strip of brand or channel cards.
 *
 * Edge-fade gradients (mask-image) on left/right hint that more items exist
 * past the viewport, replacing the visual role of a scrollbar. No auto-scroll
 * — the user drags or swipes through.
 *
 * The brief asks the tool to "prioritize brand, channel, promotion or
 * commercial effort" — these chips are the brand and channel half of that.
 */

import { formatGBP, formatPercent, gapColor } from "@/lib/format"

type ChipItem = {
  label: string
  gap_pct: number
  /** Optional £ impact for the period. Hidden when null/undefined. */
  gap_gbp?: number | null
}

export function RollupChips({
  heading,
  items,
  emptyHint,
}: {
  heading: string
  items: ChipItem[]
  emptyHint?: string
}) {
  return (
    <section aria-label={heading} className="min-w-0">
      <h3 className="mb-2 pl-4 text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
        {heading}
      </h3>

      {items.length === 0 ? (
        <p className="text-[12px] text-neutral-500">{emptyHint ?? "—"}</p>
      ) : (
        <div className="flex gap-2.5 pl-4 -mr-3 lg:-mr-6 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {items.map((it) => (
            <Chip key={it.label} {...it} />
          ))}
        </div>
      )}
    </section>
  )
}

function Chip({ label, gap_pct, gap_gbp }: ChipItem) {
  const tone = gapColor(gap_pct)
  return (
    <div className="shrink-0 rounded-xl border border-neutral-200 bg-white px-4 py-3 min-w-[200px]">
      <div className="text-[13px] font-semibold text-neutral-900 truncate">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 tabular-nums">
        <span className="text-[12px] text-neutral-500">
          {gap_gbp != null ? `≈ ${formatGBP(gap_gbp)}` : "—"}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: tone }}>
          {formatPercent(gap_pct, 1)}
        </span>
      </div>
    </div>
  )
}
