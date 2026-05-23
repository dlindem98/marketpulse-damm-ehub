"""GET /api/promos/roi — reads from snapshots/promo_roi.parquet."""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import PromoROI

router = APIRouter(prefix="/api", tags=["promos"])

PROMO_ROI = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "promo_roi.parquet"
PROMOS    = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "promos.parquet"

LIFT_HISTORY_WINDOW = 12


@lru_cache(maxsize=1)
def _roi() -> pl.DataFrame:
    if not PROMO_ROI.is_file():
        raise HTTPException(status_code=503, detail="promo_roi.parquet missing — run make train")
    return pl.read_parquet(PROMO_ROI)


@lru_cache(maxsize=1)
def _lift_history_by_type() -> dict[str, list[float]]:
    """Per-promo-type monthly lift proxy series (oldest→newest).

    True per-instance lift isn't materialised in the snapshots, so we use
    discount depth weighted by event count as a directional proxy:
      lift_proxy ≈ avg((baseline - price) / baseline) per month, across all
      promo events of that type.
    Empty for promo_types with no on-promo history.
    """
    if not PROMOS.is_file():
        return {}
    p = pl.read_parquet(PROMOS)
    if p.is_empty():
        return {}
    on_promo = (
        p.filter(pl.col("on_promo") == True)  # noqa: E712
         .with_columns(
             month=pl.col("iso_week").dt.truncate("1mo"),
             depth=(
                 (pl.col("baseline_price_gbp") - pl.col("price_gbp"))
                 / pl.col("baseline_price_gbp").clip(lower_bound=0.01)
             ),
         )
         .drop_nulls("depth")
         .group_by(["promo_type", "month"])
         .agg(lift=pl.col("depth").mean())
         .sort(["promo_type", "month"])
    )
    out: dict[str, list[float]] = {}
    for r in on_promo.iter_rows(named=True):
        out.setdefault(r["promo_type"], []).append(float(r["lift"]))
    return {k: v[-LIFT_HISTORY_WINDOW:] for k, v in out.items()}


@router.get("/promos/roi", response_model=list[PromoROI])
def get_promo_roi(
    sub_channel: str | None = Query(default=None),
    top_k: int = Query(default=10, ge=1, le=50),
) -> list[PromoROI]:
    df = _roi()
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    df = df.sort("roi", descending=True, nulls_last=True)
    lift_hist = _lift_history_by_type()
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
            lift_history=lift_hist.get(r["promo_type"], []),
        )
        for r in df.head(top_k).iter_rows(named=True)
    ]
