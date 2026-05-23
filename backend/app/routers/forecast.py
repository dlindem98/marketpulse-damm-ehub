"""GET /api/forecast — reads from snapshots/forecast.parquet."""

from datetime import date as date_t
from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import ForecastPoint, ForecastSeries

router = APIRouter(prefix="/api", tags=["forecast"])

FORECAST_PATH = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"


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
    rows = (
        df.filter(
            (pl.col("material_id") == sku) & (pl.col("sub_channel") == sub_channel)
        ).sort("date").head(horizon)
    )
    if len(rows) == 0:
        return ForecastSeries(sku=sku, sub_channel=sub_channel, granularity=granularity, points=[])

    points = []
    for r in rows.iter_rows(named=True):
        lo10 = r.get("Hl_hat_p10_cal", r.get("Hl_hat_p10"))
        hi90 = r.get("Hl_hat_p90_cal", r.get("Hl_hat_p90"))
        points.append(ForecastPoint(
            period=r["date"].strftime("%b.%y"),
            period_start=r["date"],
            point=float(r["Hl_hat_p50"]),
            lo80=float(lo10),
            hi80=float(hi90),
            lo95=float(lo10) * 0.85,
            hi95=float(hi90) * 1.15,
            is_actual=False,
        ))
    return ForecastSeries(sku=sku, sub_channel=sub_channel, granularity=granularity, points=points)
