/**
 * UkPulseHero — single-row answer to the brief's literal question:
 * "Will this month close above or below budget?"
 *
 * Layout reads top-to-bottom: scope eyebrow → headline gap → supporting
 * forecast/target numbers → watch chips. The headline number is the
 * answer; everything else is supporting evidence.
 */

import { confidenceLabel, formatGBP, formatHl, formatPercent, formatPeriod, gapColor } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type Pulse = components["schemas"]["Pulse"]

const CONFIDENCE_CHIP: Record<string, string> = {
  high:   "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
  medium: "bg-neutral-100 text-neutral-600",
  low:    "bg-[color:var(--negative-soft)] text-[color:var(--negative)]",
}

export function UkPulseHero({ pulse }: { pulse: Pulse }) {
  const positive = pulse.gap_hl >= 0
  const gapColour = gapColor(pulse.gap_pct)

  return (
    <section
      aria-label="UK monthly pulse"
      className="rounded-2xl border border-neutral-200 bg-white px-5 py-4 flex flex-col justify-center"
    >
      {/* Row 1 — scope eyebrow on the left, confidence on the right.
          Compact, lets the numbers breathe below. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
          UK portfolio · {formatPeriod(pulse.period)}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            CONFIDENCE_CHIP[pulse.confidence]
          }`}
        >
          {confidenceLabel(pulse.confidence)}
        </span>
      </div>

      {/* Row 2 — headline gap (the answer) on the left, SKUs at risk on
          the right. Two strong anchor points instead of four scattered ones. */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-6 items-end">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="text-[30px] font-semibold tabular-nums tracking-tight leading-none"
              style={{ color: gapColour }}
            >
              {positive ? "▲" : "▼"} {formatPercent(pulse.gap_pct, 1)}
            </span>
            {pulse.gap_gbp != null && (
              <span
                className="text-[13px] font-semibold tabular-nums"
                style={{ color: gapColour }}
                title="Approximate £ impact at the portfolio average price per hL"
              >
                ≈ {formatGBP(pulse.gap_gbp)}
              </span>
            )}
          </div>
          {/* Supporting line — forecast & target sit together so the math is
              obvious without the previous "vs" word getting in the way. */}
          <div className="mt-1.5 text-[12.5px] text-neutral-500 tabular-nums">
            {formatHl(pulse.total_forecast_hl)} forecast
            <span className="mx-1.5 text-neutral-300">/</span>
            {formatHl(pulse.total_target_hl)} target
            {pulse.gbp_per_hl != null && (
              <span className="ml-2 text-neutral-400">
                · {formatGBP(pulse.gbp_per_hl)}/hL
              </span>
            )}
          </div>
        </div>

        {pulse.n_skus_at_risk > 0 && (
          <div className="text-right shrink-0">
            <div className="text-[20px] font-semibold tabular-nums text-neutral-900 leading-none">
              {pulse.n_skus_at_risk}
            </div>
            <div className="mt-1 text-[10.5px] uppercase tracking-[0.16em] text-neutral-500 font-medium">
              SKUs at risk
            </div>
          </div>
        )}
      </div>

    </section>
  )
}
