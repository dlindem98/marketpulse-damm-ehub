"""GET /api/promos/roi — reads from snapshots/promo_roi.parquet."""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import PromoROI

router = APIRouter(prefix="/api", tags=["promos"])

PROMO_ROI = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "promo_roi.parquet"


@lru_cache(maxsize=1)
def _roi() -> pl.DataFrame:
    if not PROMO_ROI.is_file():
        raise HTTPException(status_code=503, detail="promo_roi.parquet missing — run make train")
    return pl.read_parquet(PROMO_ROI)


@router.get("/promos/roi", response_model=list[PromoROI])
def get_promo_roi(
    sub_channel: str | None = Query(default=None),
    top_k: int = Query(default=10, ge=1, le=50),
) -> list[PromoROI]:
    df = _roi()
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    df = df.sort("roi", descending=True, nulls_last=True)
    return [
        PromoROI(
            promo_type=r["promo_type"],
            sub_channel=r["sub_channel"],
            avg_lift_pct=float(r["avg_lift_pct"]),
            avg_lift_hl=float(r["avg_lift_hl"]),
            estimated_cost=float(r["estimated_cost"]) if r["estimated_cost"] else None,
            roi=float(r["roi"]) if r["roi"] is not None else None,
            n_observations=int(r["n_observations"]),
            confidence=r["confidence"],
        )
        for r in df.head(top_k).iter_rows(named=True)
    ]
