"""What-if scenario simulator.

Maps a (months, action_type, [discount, promo_type, effort_level]) request to
a lifted forecast plus the £ economics of running that action.

Action types
------------
- ``promo``: classic trade promo — uses ``promo_type`` and ``discount_pct``,
  produces the biggest lift but carries a discount cost.
- ``brand-focus``: marketing investment in the brand across the selected
  months. Modest lift, no discount cost.
- ``channel-focus``: extra commercial effort in this sub-channel
  (incremental listings, fixture space, in-store activation).
- ``commercial-effort``: sales-force / commercial push — order-frequency,
  trade-up conversations, etc. Smallest lift, no discount cost.

Lift math
---------

**Promo lift (lowered baseline + event boost)**:

    base = historical_lift_for(promo_type)         # promo_roi.parquet
    saturating = base × (1 − exp(−discount / SCALE))   # diminishing returns
    monthly_lift = saturating × event_boost(month)      # 1.0..1.5

We *lowered* the base historical lift to make event-importance the
differentiator: the same promo lifts more during Christmas than in a quiet
February. EVENT_BOOST_DAMPENER also scales down the table from
``app.services.calendar.EVENT_BOOST_MULTIPLIER`` so the curve stays
reasonable.

**Non-promo action types**:

Each action type has its own intrinsic lift band (LOW < MED < HIGH), again
modulated by the per-month event boost so commercial-effort during
Christmas does more than commercial-effort in February.

Cost
----

Only ``promo`` carries a discount give-away cost:

    cost = simulated_hl × (discount_pct / 100) × gross_price_per_hl

For brand-focus / channel-focus / commercial-effort the cost is set to
None — those are commercial-team investments, not directly comparable to
discount give-aways. UI shows "—" for cost when not applicable.

Backwards compatibility: ``action_type`` defaults to ``"promo"`` so older
clients sending just ``discount_pct + promo_type`` keep working.
"""

from __future__ import annotations

import math
from datetime import date as date_t

import polars as pl

from app.paths import snapshot_path
from app.schemas import (
    ForecastPoint, ForecastSeries, SimulationRequest, SimulationResult,
)
from app.services.calendar import (
    build_events,
    event_boost_for_month,
)
from app.services.pricing import gross_price_per_hl

FORECAST = snapshot_path("forecast.parquet")
TARGETS = snapshot_path("targets.parquet")
PROMO_ROI = snapshot_path("promo_roi.parquet")

# Diminishing-returns scale for promo lift.
LIFT_SCALE = 15.0

# Share of forecasted volume that actually moves through the promoted
# mechanic. Multi-buys and price-cuts don't apply to every shopper —
# baseline (non-promo) buyers are still in the volume, and not every
# shopper at the fixture takes the offer. Industry rule-of-thumb for UK
# grocery trade promos is 45–65% participation; we use 55%. Cost
# without this factor is wildly pessimistic and makes every promo look
# unprofitable.
PROMO_PARTICIPATION_RATE = 0.55

# Multiplier applied to the historical-mean promo lift to *lower* the
# baseline. The headroom is then filled back in by the event-importance
# boost in HIGH months — net effect: events drive the variance, not the
# discount slider alone.
PROMO_BASE_DAMPENER = 0.65

# Fallback historical lift per promo type when promo_roi is missing.
# Lowered from the previous round (multi-buy 0.25 → 0.18 etc.) so the
# event boost has room to lift things back up.
FALLBACK_LIFT: dict[str, float] = {
    "multi-buy": 0.18,
    "price-cut": 0.13,
    "rollback":  0.11,
    "clearance": 0.09,
    "listing":   0.06,
}

# Per-action-type lift bands. Each tuple is (low, medium, high) effort.
# These are *post-boost* central estimates; the event-boost still applies
# on top of them.
NON_PROMO_LIFT: dict[str, tuple[float, float, float]] = {
    "brand-focus":       (0.04, 0.07, 0.11),
    "channel-focus":     (0.03, 0.06, 0.09),
    "commercial-effort": (0.02, 0.04, 0.06),
}


def _parse_period(s: str) -> date_t:
    """Accept "Nov.26", "Nov 26", or "2026-11" — return month-start date."""
    EN = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,
          "Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
    s = s.strip()
    if "-" in s and s.split("-")[0].isdigit():
        y, m = s.split("-")[:2]
        return date_t(int(y), int(m), 1)
    sep = "." if "." in s else " "
    m, y = s.split(sep)
    yi = int(y)
    if yi < 100:
        yi += 2000
    return date_t(yi, EN[m[:3].title()], 1)


def _historical_lift(promo_type: str) -> float:
    if PROMO_ROI.is_file():
        roi = pl.read_parquet(PROMO_ROI).filter(pl.col("promo_type") == promo_type)
        if len(roi):
            mean = float(roi["avg_lift_pct"].mean())
            return max(0.0, mean)
    return FALLBACK_LIFT.get(promo_type, 0.08)


def _applied_lift_promo(promo_type: str, discount_pct: float) -> float:
    """Saturating + dampened lift for the promo action type."""
    if discount_pct <= 0:
        return 0.0
    base = _historical_lift(promo_type) * PROMO_BASE_DAMPENER
    return base * (1.0 - math.exp(-discount_pct / LIFT_SCALE))


def _applied_lift_effort(action_type: str, effort_level: str) -> float:
    """Lift for non-promo action types."""
    band = NON_PROMO_LIFT.get(action_type)
    if not band:
        return 0.0
    idx = {"low": 0, "medium": 1, "high": 2}.get(effort_level, 1)
    return band[idx]


def _empty_result(req: SimulationRequest, notes: str) -> SimulationResult:
    return SimulationResult(
        baseline=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
        simulated=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
        gap_before_hl=0.0,
        gap_after_hl=0.0,
        gap_closed_pct=0.0,
        lift_hl=0.0,
        lift_gbp=None,
        estimated_cost=None,
        net_gbp=None,
        gbp_per_hl=None,
        applied_lift_pct=0.0,
        event_boost_avg=1.0,
        notes=notes,
    )


def simulate(req: SimulationRequest) -> SimulationResult:
    if not FORECAST.is_file():
        return _empty_result(req, "forecast.parquet missing — run STEPs 1-6 first.")

    target_dates = [_parse_period(p) for p in req.months]
    if not target_dates:
        return _empty_result(req, "No months selected.")

    fc = pl.read_parquet(FORECAST)
    base = fc.filter(
        (pl.col("material_id") == req.sku)
        & (pl.col("sub_channel") == req.sub_channel)
        & (pl.col("date").is_in(target_dates))
    ).sort("date")

    if len(base) == 0:
        return _empty_result(
            req,
            f"No forecast available for {req.sku} × {req.sub_channel} in those months.",
        )

    # Resolve the per-action-type baseline lift (before per-month event boost).
    if req.action_type == "promo":
        action_lift_base = _applied_lift_promo(req.promo_type, req.discount_pct)
    else:
        action_lift_base = _applied_lift_effort(req.action_type, req.effort_level)

    # Build the calendar event list once across the selected window so the
    # per-month event-boost lookup is O(1) per month.
    events = build_events(min(target_dates), max(target_dates))

    # Price per hL — used for both lift_gbp and cost.
    rate, _ = gross_price_per_hl(sku=req.sku, sub_channel=req.sub_channel)
    if rate is None:
        rate, _ = gross_price_per_hl(sku=req.sku)

    points_baseline: list[ForecastPoint] = []
    points_simulated: list[ForecastPoint] = []
    boost_sum = 0.0
    boost_n = 0
    for r in base.iter_rows(named=True):
        point_hl = float(r["Hl_hat_p50"])
        lo = float(r.get("Hl_hat_p10_cal", r.get("Hl_hat_p10")))
        hi = float(r.get("Hl_hat_p90_cal", r.get("Hl_hat_p90")))
        period = r["date"].strftime("%b.%y")
        month_iso = r["date"].isoformat()
        # Per-month event multiplier (1.0 = no boost; up to 1.5 for HIGH).
        boost = event_boost_for_month(month_iso, events)
        boost_sum += boost
        boost_n += 1
        monthly_lift = action_lift_base * boost

        points_baseline.append(ForecastPoint(
            period=period, period_start=r["date"],
            point=point_hl, lo80=lo, hi80=hi, lo95=lo*0.85, hi95=hi*1.15,
        ))
        sim_hl = point_hl * (1.0 + monthly_lift)
        points_simulated.append(ForecastPoint(
            period=period, period_start=r["date"],
            point=sim_hl, lo80=lo, hi80=hi, lo95=lo*0.85, hi95=hi*1.15,
        ))

    boost_avg = (boost_sum / boost_n) if boost_n else 1.0

    # Gap vs target. Carry the per-month breakdown too so the FE can
    # render the target dashed line on the simulator chart and count
    # how many months actually clear target after the action.
    target_hl = 0.0
    targets_by_period: dict[str, float] = {}
    if TARGETS.is_file():
        tgt = pl.read_parquet(TARGETS).filter(
            (pl.col("material_id") == req.sku)
            & (pl.col("sub_channel") == req.sub_channel)
            & (pl.col("date").is_in(target_dates))
        )
        if len(tgt):
            target_hl = float(tgt["target_hl"].sum())
            for r in tgt.iter_rows(named=True):
                targets_by_period[r["date"].strftime("%b.%y")] = float(r["target_hl"])

    baseline_hl = sum(p.point for p in points_baseline)
    simulated_hl = sum(p.point for p in points_simulated)
    lift_hl = simulated_hl - baseline_hl
    gap_before = baseline_hl - target_hl
    gap_after = simulated_hl - target_hl
    gap_closed_pct = (
        (gap_after - gap_before) / abs(gap_before) if gap_before != 0 else 0.0
    )

    lift_gbp: float | None = None
    cost_gbp: float | None = None
    net_gbp: float | None = None
    if rate is not None:
        lift_gbp = lift_hl * rate
        if req.action_type == "promo":
            cost_gbp = (
                simulated_hl
                * (req.discount_pct / 100.0)
                * PROMO_PARTICIPATION_RATE
                * rate
            )
            net_gbp = lift_gbp - cost_gbp
        else:
            # Non-promo actions don't carry a discount give-away. Cost is
            # the responsibility of the commercial team and isn't comparable.
            cost_gbp = None
            net_gbp = lift_gbp

    # Build a human notes line that surfaces both the lift and the boost.
    if req.action_type == "promo":
        action_desc = (
            f"{req.promo_type} @ {req.discount_pct:.0f}% across "
            f"{len(req.months)} month{'s' if len(req.months) != 1 else ''}"
        )
    else:
        action_desc = (
            f"{req.action_type} ({req.effort_level} effort) across "
            f"{len(req.months)} month{'s' if len(req.months) != 1 else ''}"
        )
    boost_note = (
        f"event boost ×{boost_avg:.2f} avg"
        if boost_avg > 1.001
        else "no event boost"
    )
    notes = " · ".join([
        action_desc,
        f"applied lift {action_lift_base * 100:.1f}% base · {boost_note}",
        f"unit price proxy £{rate:.0f}/hL" if rate is not None else "",
    ]).strip(" ·")

    return SimulationResult(
        baseline=ForecastSeries(
            sku=req.sku, sub_channel=req.sub_channel,
            granularity="month", points=points_baseline,
        ),
        simulated=ForecastSeries(
            sku=req.sku, sub_channel=req.sub_channel,
            granularity="month", points=points_simulated,
        ),
        targets_by_period=targets_by_period,
        gap_before_hl=gap_before,
        gap_after_hl=gap_after,
        gap_closed_pct=gap_closed_pct,
        lift_hl=lift_hl,
        lift_gbp=lift_gbp,
        estimated_cost=cost_gbp,
        net_gbp=net_gbp,
        gbp_per_hl=rate,
        applied_lift_pct=action_lift_base,
        event_boost_avg=boost_avg,
        notes=notes,
    )
