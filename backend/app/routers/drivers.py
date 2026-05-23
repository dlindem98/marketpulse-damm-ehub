"""GET /api/drivers — reads SHAP drivers from snapshots/drivers.parquet."""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import Driver

router = APIRouter(prefix="/api", tags=["drivers"])

DRIVERS = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "drivers.parquet"


@lru_cache(maxsize=1)
def _drivers() -> pl.DataFrame:
    if not DRIVERS.is_file():
        raise HTTPException(status_code=503, detail="drivers.parquet missing — run make train")
    return pl.read_parquet(DRIVERS)


def _explanation(family: str, feature: str, val: float) -> str:
    sign = "lower" if val > 0 else "higher"
    if family == "Recent trend":
        return f"Recent {feature.replace('_', ' ')} of this SKU contributes {val:+.1f} Hl to the forecast — {'positive momentum' if val > 0 else 'softening trend'}."
    if family.startswith("Calendar"):
        return f"{family} adds {val:+.1f} Hl ({sign} demand expected vs typical month)."
    if family == "Seasonality":
        return f"Seasonal pattern contributes {val:+.1f} Hl based on calendar position."
    if family == "Weather":
        return f"Weather signal contributes {val:+.1f} Hl ({sign} pull on demand than usual)."
    if family == "Brand search demand":
        return f"Google-Trends interest in beer brands contributes {val:+.1f} Hl."
    if family == "UK retail market trend":
        return f"ONS retail-sales index contributes {val:+.1f} Hl to the forecast."
    if family.endswith("mix"):
        return f"{family} (target-encoded category) contributes {val:+.1f} Hl."
    return f"{feature} contributes {val:+.1f} Hl."


@router.get("/drivers", response_model=list[Driver])
def get_drivers(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    period: str = Query(default=""),  # accepted but ignored (drivers are computed once)
    top_k: int = Query(default=3, ge=1, le=10),
) -> list[Driver]:
    df = _drivers().filter(
        (pl.col("material_id") == sku) & (pl.col("sub_channel") == sub_channel)
    ).sort("rank")
    if len(df) == 0:
        return []
    return [
        Driver(
            feature=r["feature"],
            shap_value=float(r["shap_value"]),
            direction=r["direction"],
            explanation=_explanation(r["family"], r["feature"], float(r["shap_value"])),
        )
        for r in df.head(top_k).iter_rows(named=True)
    ]
