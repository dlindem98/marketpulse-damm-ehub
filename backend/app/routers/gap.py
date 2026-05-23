"""GET /api/gap — joins forecast.parquet × targets.parquet."""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import GapItem

router = APIRouter(prefix="/api", tags=["gap"])

FORECAST = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"
TARGETS  = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "targets.parquet"


@lru_cache(maxsize=1)
def _gap_table() -> pl.DataFrame:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(status_code=503, detail="forecast.parquet or targets.parquet missing")
    fc = pl.read_parquet(FORECAST)
    tg = pl.read_parquet(TARGETS)
    return (
        fc.join(tg, on=["material_id", "sub_channel", "date"], how="left")
          .with_columns(
              gap_hl=(pl.col("Hl_hat_p50") - pl.col("target_hl")),
              gap_pct=((pl.col("Hl_hat_p50") - pl.col("target_hl")) / pl.col("target_hl").clip(lower_bound=1)),
          )
          .with_columns(
              confidence=pl.when(pl.col("target_source") == "prior_year").then(pl.lit("medium"))
                           .otherwise(pl.lit("low")),
          )
    )


@router.get("/gap", response_model=list[GapItem])
def get_gap(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
    sort: str = Query(default="gap_pct_asc"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[GapItem]:
    df = _gap_table()
    if brand:
        df = df.filter(pl.col("brand") == brand)
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    df = df.sort("gap_pct", descending=sort.endswith("_desc"))
    return [
        GapItem(
            sku=r["material_id"],
            sub_channel=r["sub_channel"],
            period=r["date"].strftime("%b.%y"),
            forecast_hl=float(r["Hl_hat_p50"]),
            budget_hl=float(r["target_hl"] or 0),
            gap_hl=float(r["gap_hl"] or 0),
            gap_pct=float(r["gap_pct"] or 0),
            confidence=r["confidence"],
        )
        for r in df.head(limit).iter_rows(named=True)
    ]
