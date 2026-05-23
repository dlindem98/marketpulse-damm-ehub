from typing import Literal

from pydantic import BaseModel, Field

from .forecast import ForecastSeries


class SimulationRequest(BaseModel):
    sku: str
    sub_channel: str
    months: list[str]                              # e.g. ["Nov.26", "Dec.26"]
    discount_pct: float = Field(ge=0, le=100)
    promo_type: Literal[
        "multi-buy", "price-cut", "rollback", "clearance", "listing"
    ] = "multi-buy"


class SimulationResult(BaseModel):
    baseline: ForecastSeries
    simulated: ForecastSeries
    gap_before_hl: float
    gap_after_hl: float
    gap_closed_pct: float
    estimated_cost: float | None = None
    notes: str
