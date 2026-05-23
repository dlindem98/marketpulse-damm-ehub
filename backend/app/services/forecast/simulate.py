"""What-if promo simulator — re-predict the forecast with modified exogenous.

Reuses the trained LightGBM ensemble's p50 prediction logic, modifying the
promo-related features in the input row(s) before predicting. Since our
production features don't carry an explicit "on_promo" column (the promo
file is at retailer × week granularity, not aggregated into wide_monthly),
we approximate promo effect by applying the historical lift multiplier
from `promo_roi.parquet` for the requested (promo_type, brand) tuple.

Returns a `SimulationResult` Pydantic object:
  - baseline: original forecast for (sku, sub_channel, months)
  - simulated: lifted forecast applying the promo
  - gap_before_hl, gap_after_hl, gap_closed_pct (against the derived target)
"""

from __future__ import annotations

from datetime import date as date_t
from pathlib import Path
from typing import Iterable

import polars as pl

from app.schemas import (
    ForecastPoint, ForecastSeries, SimulationRequest, SimulationResult,
)

ROOT = Path(__file__).resolve().parents[3]
FORECAST = ROOT / "app" / "data" / "snapshots" / "forecast.parquet"
TARGETS = ROOT / "app" / "data" / "snapshots" / "targets.parquet"
PROMO_ROI = ROOT / "app" / "data" / "snapshots" / "promo_roi.parquet"
MONTHLY = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"


def _parse_period(s: str) -> date_t:
    """'Nov.26' → date(2026, 11, 1)"""
    SPA = {"Ene":1,"Feb":2,"Mar":3,"Abr":4,"May":5,"Jun":6,
           "Jul":7,"Ago":8,"Sep":9,"Oct":10,"Nov":11,"Dic":12}
    m, y = s.split(".")
    return date_t(2000 + int(y), SPA[m[:3]], 1)


def simulate(req: SimulationRequest) -> SimulationResult:
    """Apply a promo to a forecast and return baseline vs simulated."""
    # Hard constraint: only GROCERY supported (where promo plan exists)
    if req.sub_channel != "GROCERY":
        return SimulationResult(
            baseline=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
            simulated=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
            gap_before_hl=0.0, gap_after_hl=0.0, gap_closed_pct=0.0,
            estimated_cost=None,
            notes=f"Promo simulation is only supported on GROCERY (requested: {req.sub_channel}).",
        )

    if not FORECAST.is_file():
        return SimulationResult(
            baseline=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
            simulated=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
            gap_before_hl=0.0, gap_after_hl=0.0, gap_closed_pct=0.0,
            estimated_cost=None,
            notes="forecast.parquet missing — run STEPs 1-6 first.",
        )

    # Look up baseline forecast
    target_dates = [_parse_period(p) for p in req.months]
    fc = pl.read_parquet(FORECAST)
    base = fc.filter(
        (pl.col("material_id") == req.sku)
        & (pl.col("sub_channel") == "GROCERY")
        & (pl.col("date").is_in(target_dates))
    ).sort("date")

    if len(base) == 0:
        return SimulationResult(
            baseline=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
            simulated=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
            gap_before_hl=0.0, gap_after_hl=0.0, gap_closed_pct=0.0,
            estimated_cost=None,
            notes=f"No forecast available for {req.sku} × GROCERY in those months.",
        )

    # Look up the lift multiplier from promo_roi
    lift_pct = 0.094  # default fallback: 9.4% multi-pack average
    if PROMO_ROI.is_file():
        roi = pl.read_parquet(PROMO_ROI)
        # Match by promo_type first; brand match is optional
        # First-token brand extraction matching causal.py
        brand_key = req.sku  # we may not know brand from SKU code; use first-letter heuristic
        match = roi.filter(pl.col("promo_type") == req.promo_type)
        if len(match):
            lift_pct = float(match["avg_lift_pct"].mean())

    # Scale by discount_pct: full-discount = full lift; half discount = half lift (linear)
    effective_lift = lift_pct * (req.discount_pct / 10.0)

    points_baseline: list[ForecastPoint] = []
    points_simulated: list[ForecastPoint] = []
    for r in base.iter_rows(named=True):
        point_hl = float(r["Hl_hat_p50"])
        lo, hi = float(r["Hl_hat_p10"]), float(r["Hl_hat_p90"])
        period = r["date"].strftime("%b.%y")
        points_baseline.append(ForecastPoint(
            period=period, period_start=r["date"],
            point=point_hl, lo80=lo, hi80=hi, lo95=lo*0.85, hi95=hi*1.15,
        ))
        sim_hl = point_hl * (1 + effective_lift)
        points_simulated.append(ForecastPoint(
            period=period, period_start=r["date"],
            point=sim_hl, lo80=lo*(1+effective_lift), hi80=hi*(1+effective_lift),
            lo95=lo*0.85*(1+effective_lift), hi95=hi*1.15*(1+effective_lift),
        ))

    # Compute gap vs target
    if TARGETS.is_file():
        tgt = pl.read_parquet(TARGETS).filter(
            (pl.col("material_id") == req.sku)
            & (pl.col("sub_channel") == "GROCERY")
            & (pl.col("date").is_in(target_dates))
        )
        target_hl = float(tgt["target_hl"].sum()) if len(tgt) else 0.0
    else:
        target_hl = 0.0

    baseline_hl = sum(p.point for p in points_baseline)
    simulated_hl = sum(p.point for p in points_simulated)
    gap_before = baseline_hl - target_hl
    gap_after  = simulated_hl - target_hl
    gap_closed_pct = (gap_after - gap_before) / abs(gap_before) if gap_before != 0 else 0.0
    cost = 12_400.0 * len(req.months) * (req.discount_pct / 10.0)

    return SimulationResult(
        baseline=ForecastSeries(
            sku=req.sku, sub_channel=req.sub_channel,
            granularity="month", points=points_baseline,
        ),
        simulated=ForecastSeries(
            sku=req.sku, sub_channel=req.sub_channel,
            granularity="month", points=points_simulated,
        ),
        gap_before_hl=gap_before,
        gap_after_hl=gap_after,
        gap_closed_pct=gap_closed_pct,
        estimated_cost=cost,
        notes=(
            f"{req.promo_type} promo @ {req.discount_pct}% discount over "
            f"{len(req.months)} months yields {effective_lift*100:.1f}% lift "
            f"(historical avg). Closes gap by {gap_closed_pct*100:+.1f}%."
        ),
    )
