"""GET /api/forecast — reads from snapshots/forecast.parquet."""

from datetime import date as date_t
from functools import lru_cache

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.paths import snapshot_path
from app.schemas import ForecastPoint, ForecastSeries
from app.services.calendar import build_events
from app.services.promo_windows import build_promo_windows
from app.services.weekly_split import MonthlyPoint, split_monthly_to_weekly

router = APIRouter(prefix="/api", tags=["forecast"])

FORECAST_PATH = snapshot_path("forecast.parquet")


@lru_cache(maxsize=1)
def _load_forecast() -> pl.DataFrame:
    if not FORECAST_PATH.is_file():
        raise HTTPException(status_code=503, detail="forecast.parquet missing — run make train")
    return pl.read_parquet(FORECAST_PATH)


@router.get("/forecast", response_model=ForecastSeries)
def get_forecast(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    granularity: str = Query(default="month", pattern="^(month|week)$"),
    horizon: int = Query(default=9, ge=1, le=24),
) -> ForecastSeries:
    df = _load_forecast()
    # For weekly mode, pull the full monthly horizon and split downstream so
    # we still respect the caller's `horizon` count when applied per-week.
    fetch_horizon = horizon if granularity == "month" else min(horizon, 24)
    rows = (
        df.filter(
            (pl.col("material_id") == sku) & (pl.col("sub_channel") == sub_channel)
        ).sort("date").head(fetch_horizon)
    )
    if len(rows) == 0:
        return ForecastSeries(sku=sku, sub_channel=sub_channel, granularity=granularity, points=[])

    monthly: list[MonthlyPoint] = []
    for r in rows.iter_rows(named=True):
        lo10 = r.get("Hl_hat_p10_cal", r.get("Hl_hat_p10"))
        hi90 = r.get("Hl_hat_p90_cal", r.get("Hl_hat_p90"))
        monthly.append(MonthlyPoint(
            period=r["date"].strftime("%b.%y"),
            period_start=r["date"],
            point=float(r["Hl_hat_p50"]),
            lo80=float(lo10),
            hi80=float(hi90),
        ))

    if granularity == "week":
        # Deterministic pro-rata split (see app/services/weekly_split.py).
        weekly = split_monthly_to_weekly(monthly)[:horizon * 5]
        points = [
            ForecastPoint(
                period=w.period,
                period_start=w.period_start,
                point=w.point,
                lo80=w.lo80,
                hi80=w.hi80,
                lo95=w.lo80 * 0.85,
                hi95=w.hi80 * 1.15,
                is_actual=False,
            )
            for w in weekly
        ]
    else:
        points = [
            ForecastPoint(
                period=mp.period,
                period_start=mp.period_start,
                point=mp.point,
                lo80=mp.lo80,
                hi80=mp.hi80,
                lo95=mp.lo80 * 0.85,
                hi95=mp.hi80 * 1.15,
                is_actual=False,
            )
            for mp in monthly
        ]

    horizon_start = points[0].period_start
    horizon_end = points[-1].period_start
    try:
        promo_windows = build_promo_windows(
            material_id=sku,
            sub_channel=sub_channel,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
        )
    except Exception:  # promo enrichment must never break the forecast call
        promo_windows = []
    try:
        events = build_events(
            start=date_t(horizon_start.year, horizon_start.month, 1).replace(
                year=horizon_start.year - 1
            ),
            end=horizon_end,
        )
    except Exception:
        events = []

    return ForecastSeries(
        sku=sku,
        sub_channel=sub_channel,
        granularity=granularity,
        points=points,
        promo_windows=promo_windows,
        events=events,
    )
