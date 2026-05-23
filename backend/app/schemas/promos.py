from typing import Literal

from pydantic import BaseModel


class PromoROI(BaseModel):
    promo_type: str                                # e.g. "multi-pack"
    sub_channel: str
    avg_lift_pct: float                            # from CausalImpact
    avg_lift_hl: float
    estimated_cost: float | None = None
    roi: float | None = None                       # null if cost unknown
    n_observations: int
    confidence: Literal["low", "medium", "high"] = "low"
    # NEW: trailing per-month lift signal for this promo_type (oldest→newest,
    # up to 12 points). Derived from discount depth on historical promo events
    # in promos.parquet, weighted by event count. Empty when there's no
    # historical signal.
    lift_history: list[float] = []
