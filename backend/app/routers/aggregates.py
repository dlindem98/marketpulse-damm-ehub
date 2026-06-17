"""Aggregate endpoints powering the UK-level Overview surfaces.

Endpoints:
  GET /api/forecast/timeline       — monthly forecast + target series for the main chart
  GET /api/forecast/by-sub-channel — per sub_channel rollup
  GET /api/forecast/by-brand       — per brand rollup
  GET /api/pulse                   — single-period pulse: forecast vs target headline

All endpoints accept an optional `period` filter (e.g. "May.26" or "2026-05") so
the home page can scope its KPIs and chips to the current month, matching the
brief's "will the month close above/below target?" framing.
"""

from datetime import date as date_t
from datetime import datetime
from functools import lru_cache

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.paths import snapshot_path
from app.schemas import BrandRollup, Pulse, SubChannelRollup, WorstSlice
from app.services.anonymize import sub_channel_label
from app.services.pricing import (
    portfolio_price_per_hl,
    price_by_brand,
    price_by_sub_channel,
)

router = APIRouter(prefix="/api", tags=["aggregates"])

FORECAST = snapshot_path("forecast.parquet")
TARGETS = snapshot_path("targets.parquet")
WIDE = snapshot_path("wide_monthly.parquet")


@lru_cache(maxsize=1)
def _frames() -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(503, "snapshots missing — run make train")
    return pl.read_parquet(FORECAST), pl.read_parquet(TARGETS), pl.read_parquet(WIDE)


def _parse_period(period: str | None) -> date_t | None:
    """Accept "May.26", "2026-05", "2026-05-01" — all referring to a month-start."""
    if not period:
        return None
    p = period.strip()
    # "May.26"
    if "." in p:
        try:
            return datetime.strptime(p, "%b.%y").date().replace(day=1)
        except ValueError:
            return None
    # "2026-05" or "2026-05-01"
    if p.count("-") == 1:
        try:
            return datetime.strptime(p + "-01", "%Y-%m-%d").date()
        except ValueError:
            return None
    try:
        return datetime.strptime(p, "%Y-%m-%d").date().replace(day=1)
    except ValueError:
        return None


def _confidence_from_band(point: float, lo: float, hi: float) -> str:
    """Map relative band width to a low/medium/high confidence label.

    Same thresholds used in the SKU-level diagnosis panel (web/src/.../diagnosis-panel.tsx),
    kept in sync intentionally so SKU and UK-level readouts agree on what
    "high confidence" means.
    """
    if point <= 0:
        return "low"
    rel = (hi - lo) / point
    if rel < 0.15:
        return "high"
    if rel > 0.30:
        return "low"
    return "medium"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _scope_to_period(
    fc: pl.DataFrame, tg: pl.DataFrame, period_date: date_t | None,
) -> tuple[pl.DataFrame, pl.DataFrame]:
    if period_date is None:
        return fc, tg
    fc_s = fc.filter(pl.col("date") == period_date)
    tg_s = tg.filter(pl.col("date") == period_date)
    return fc_s, tg_s


def _align_targets(fc: pl.DataFrame, tg: pl.DataFrame) -> pl.DataFrame:
    """Keep only target rows that match forecast (sku, sub_channel, date) keys."""
    keys = fc.select(["material_id", "sub_channel", "date"]).unique()
    return tg.join(keys, on=["material_id", "sub_channel", "date"], how="inner")


# ─────────────────────────────────────────────────────────────────────────────
# /api/forecast/by-sub-channel — period-aware
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/forecast/by-sub-channel", response_model=list[SubChannelRollup])
def forecast_by_sub_channel(
    brand: str | None = Query(default=None),
    period: str | None = Query(default=None, description='"May.26" or "2026-05"'),
):
    """Per-sub_channel rollup, optionally scoped to a single period."""
    fc, tg, _ = _frames()
    if brand:
        fc = fc.filter(pl.col("brand") == brand)
    fc, tg = _scope_to_period(fc, tg, _parse_period(period))
    tg = _align_targets(fc, tg)

    fc_by = fc.group_by("sub_channel").agg(forecast=pl.col("Hl_hat_p50").sum())
    tg_by = tg.group_by("sub_channel").agg(target=pl.col("target_hl").sum())
    merged = (
        fc_by.join(tg_by, on="sub_channel", how="left")
        .with_columns(
            target=pl.col("target").fill_null(0.0),
            gap_pct=((pl.col("forecast") - pl.col("target").fill_null(0.0)) / pl.col("target").clip(lower_bound=1)).fill_null(0.0),
        )
        .sort("forecast", descending=True)
    )

    chan_codes = [r["sub_channel"] for r in merged.iter_rows(named=True)]
    rates = price_by_sub_channel(chan_codes)
    return [
        {
            "name": sub_channel_label(r["sub_channel"]),
            "code": r["sub_channel"],
            "forecast": float(r["forecast"]),
            "target": float(r["target"]),
            "gap_pct": float(r["gap_pct"]),
            "gap_hl": float(r["forecast"]) - float(r["target"]),
            "gap_gbp": (
                (float(r["forecast"]) - float(r["target"])) * rates[r["sub_channel"]]
                if rates.get(r["sub_channel"]) is not None
                else None
            ),
        }
        for r in merged.iter_rows(named=True)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# /api/forecast/by-brand — NEW
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/forecast/by-brand", response_model=list[BrandRollup])
def forecast_by_brand(
    sub_channel: str | None = Query(default=None),
    period: str | None = Query(default=None, description='"May.26" or "2026-05"'),
    limit: int = Query(default=12, ge=1, le=50),
):
    """Per-brand rollup, period-scoped. Sorted by absolute forecast volume."""
    fc, tg, _ = _frames()
    if sub_channel:
        fc = fc.filter(pl.col("sub_channel") == sub_channel)
    fc, tg = _scope_to_period(fc, tg, _parse_period(period))
    tg = _align_targets(fc, tg)

    fc_by = fc.group_by("brand").agg(
        forecast=pl.col("Hl_hat_p50").sum(),
        n_skus=pl.col("material_id").n_unique(),
    )
    # Targets don't carry brand — backfill via forecast→brand mapping.
    brand_map = fc.select(["material_id", "brand"]).unique()
    tg_with_brand = tg.join(brand_map, on="material_id", how="left")
    tg_by = tg_with_brand.group_by("brand").agg(target=pl.col("target_hl").sum())

    merged = (
        fc_by.join(tg_by, on="brand", how="left")
        .with_columns(
            target=pl.col("target").fill_null(0.0),
            gap_hl=pl.col("forecast") - pl.col("target").fill_null(0.0),
            gap_pct=((pl.col("forecast") - pl.col("target").fill_null(0.0)) / pl.col("target").clip(lower_bound=1)).fill_null(0.0),
        )
        .sort("forecast", descending=True)
        .head(limit)
    )

    brand_codes = [r["brand"] for r in merged.iter_rows(named=True)]
    rates = price_by_brand(brand_codes)
    return [
        {
            "brand": r["brand"],
            "forecast": float(r["forecast"]),
            "target": float(r["target"]),
            "gap_pct": float(r["gap_pct"]),
            "gap_hl": float(r["gap_hl"]),
            "gap_gbp": (
                float(r["gap_hl"]) * rates[r["brand"]]
                if rates.get(r["brand"]) is not None
                else None
            ),
            "n_skus": int(r["n_skus"]),
        }
        for r in merged.iter_rows(named=True)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# /api/pulse — single-period headline answer to "will we hit target?"
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pulse", response_model=Pulse)
def pulse(
    period: str | None = Query(default=None, description='"May.26" or "2026-05" — defaults to the earliest forecast month'),
):
    """One-call headline for the UK home page.

    Answers the brief's literal question — "is this month going to close above
    or below the estimated budget" — at the portfolio level (all SKUs, all
    sub-channels). Returns the worst-contributing brand and sub-channel so the
    home page can call out where to look first.
    """
    fc, tg, _ = _frames()

    # Default period: earliest available forecast month (the upcoming month
    # from "today's" perspective when the snapshot was built).
    target_date = _parse_period(period) or sorted(fc["date"].unique().to_list())[0]
    fc_p = fc.filter(pl.col("date") == target_date)
    tg_p = tg.filter(pl.col("date") == target_date)
    tg_p = _align_targets(fc_p, tg_p)

    if len(fc_p) == 0:
        raise HTTPException(404, f"no forecast for period {target_date.isoformat()}")

    total_forecast = float(fc_p["Hl_hat_p50"].sum())
    total_target = float(tg_p["target_hl"].sum()) if len(tg_p) else 0.0
    lo_col = "Hl_hat_p10_cal" if "Hl_hat_p10_cal" in fc_p.columns else "Hl_hat_p10"
    hi_col = "Hl_hat_p90_cal" if "Hl_hat_p90_cal" in fc_p.columns else "Hl_hat_p90"
    total_lo = float(fc_p[lo_col].sum())
    total_hi = float(fc_p[hi_col].sum())

    gap_hl = total_forecast - total_target
    gap_pct = gap_hl / max(total_target, 1.0) if total_target > 0 else 0.0
    confidence = _confidence_from_band(total_forecast, total_lo, total_hi)

    # SKUs at risk: forecast under 95% of target in this period.
    by_sku = (
        fc_p.group_by("material_id")
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(
            tg_p.group_by("material_id").agg(target=pl.col("target_hl").sum()),
            on="material_id", how="left",
        )
        .with_columns(target=pl.col("target").fill_null(0.0))
    )
    n_at_risk = int((by_sku["forecast"] < by_sku["target"] * 0.95).sum())

    # Worst brand by absolute hL shortfall.
    brand_map = fc_p.select(["material_id", "brand"]).unique()
    by_brand_tg = (
        tg_p.join(brand_map, on="material_id", how="left")
        .group_by("brand")
        .agg(target=pl.col("target_hl").sum())
    )
    by_brand = (
        fc_p.group_by("brand")
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(by_brand_tg, on="brand", how="left")
        .with_columns(
            target=pl.col("target").fill_null(0.0),
            gap_hl=pl.col("forecast") - pl.col("target").fill_null(0.0),
        )
        .sort("gap_hl")  # most-negative first
    )
    worst_brand: WorstSlice | None = None
    if len(by_brand) > 0:
        row = by_brand.row(0, named=True)
        if row["gap_hl"] < 0:
            brand_rate = price_by_brand([row["brand"]]).get(row["brand"])
            worst_brand = WorstSlice(
                name=row["brand"],
                gap_hl=float(row["gap_hl"]),
                gap_pct=float(row["gap_hl"]) / max(float(row["target"]), 1.0) if row["target"] > 0 else 0.0,
                gap_gbp=(float(row["gap_hl"]) * brand_rate) if brand_rate is not None else None,
            )

    # Worst sub-channel by absolute hL shortfall.
    by_chan_tg = tg_p.group_by("sub_channel").agg(target=pl.col("target_hl").sum())
    by_chan = (
        fc_p.group_by("sub_channel")
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(by_chan_tg, on="sub_channel", how="left")
        .with_columns(
            target=pl.col("target").fill_null(0.0),
            gap_hl=pl.col("forecast") - pl.col("target").fill_null(0.0),
        )
        .sort("gap_hl")
    )
    worst_channel: WorstSlice | None = None
    if len(by_chan) > 0:
        row = by_chan.row(0, named=True)
        if row["gap_hl"] < 0:
            chan_rate = price_by_sub_channel([row["sub_channel"]]).get(row["sub_channel"])
            worst_channel = WorstSlice(
                name=sub_channel_label(row["sub_channel"]),
                code=row["sub_channel"],
                gap_hl=float(row["gap_hl"]),
                gap_pct=float(row["gap_hl"]) / max(float(row["target"]), 1.0) if row["target"] > 0 else 0.0,
                gap_gbp=(float(row["gap_hl"]) * chan_rate) if chan_rate is not None else None,
            )

    # Portfolio-level £/hL — used to translate the headline gap to a £
    # impact. Read once, surfaced both as the rate (for UI disclosure) and
    # baked into `gap_gbp`.
    rate = portfolio_price_per_hl()

    return Pulse(
        period=target_date.strftime("%b.%y"),
        period_start=target_date.isoformat(),
        total_forecast_hl=total_forecast,
        total_target_hl=total_target,
        gap_hl=gap_hl,
        gap_pct=gap_pct,
        gap_gbp=(gap_hl * rate) if rate is not None else None,
        gbp_per_hl=rate,
        confidence=confidence,  # type: ignore[arg-type]
        n_skus_at_risk=n_at_risk,
        worst_brand=worst_brand,
        worst_channel=worst_channel,
    )
