"""GET /api/kpis — aggregates from forecast.parquet × targets.parquet."""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import KpiSummary

router = APIRouter(prefix="/api", tags=["kpis"])

FORECAST = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"
TARGETS = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "targets.parquet"


@lru_cache(maxsize=1)
def _kpis() -> dict:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(status_code=503, detail="snapshots missing — run make train")
    fc = pl.read_parquet(FORECAST)
    tg = pl.read_parquet(TARGETS)

    # Filter targets to the same (sku, sub_channel, date) keys as the forecast
    # — otherwise we're comparing the forecast subset to a wider target population.
    keys = fc.select(["material_id", "sub_channel", "date"]).unique()
    tg = tg.join(keys, on=["material_id", "sub_channel", "date"], how="inner")

    fc_total = float(fc["Hl_hat_p50"].sum())
    tg_total = float(tg["target_hl"].sum())
    gap = fc_total - tg_total
    gap_pct = gap / max(tg_total, 1.0) if tg_total > 0 else 0.0
    # SKUs at risk: forecast < 95% of target (computed on aligned keys)
    by_sku = (
        fc.group_by("material_id")
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(
            tg.group_by("material_id").agg(target=pl.col("target_hl").sum()),
            on="material_id", how="left",
        )
        .with_columns(target=pl.col("target").fill_null(0.0))
    )
    off_track = int((by_sku["forecast"] < by_sku["target"] * 0.95).sum())
    on_track = int((by_sku["forecast"] >= by_sku["target"] * 0.95).sum())

    periods = sorted(fc["date"].unique().to_list())
    return {
        "total_forecast_hl": fc_total,
        "total_budget_hl": tg_total,
        "gap_hl": gap,
        "gap_pct": gap_pct,
        "on_track_skus": on_track,
        "off_track_skus": off_track,
        "period_range": (periods[0].strftime("%b.%y"), periods[-1].strftime("%b.%y")),
    }


@router.get("/kpis", response_model=KpiSummary)
def get_kpis(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
) -> KpiSummary:
    return KpiSummary(**_kpis())
