from typing import Literal

from pydantic import BaseModel, Field

from .forecast import ForecastSeries


# All action types the simulator supports. Promos drive the most lift but
# require a discount give-away cost; the others are commercial efforts
# (brand push, channel investment, sales-force effort) with lower lift but
# also no discount cost.
ActionType = Literal[
    "promo",            # classic promo — uses promo_type + discount_pct
    "brand-focus",      # marketing push for this brand across the period
    "channel-focus",    # extra effort in this sub-channel
    "commercial-effort" # sales-force / commercial push, no discount
]

PromoType = Literal[
    "multi-buy", "price-cut", "rollback", "clearance", "listing"
]

EffortLevel = Literal["low", "medium", "high"]


class SimulationRequest(BaseModel):
    sku: str
    sub_channel: str
    months: list[str]                              # e.g. ["Nov.26", "Dec.26"]
    # Action being simulated. Defaults to "promo" for backwards-compat with
    # callers that still send only promo_type + discount_pct.
    action_type: ActionType = "promo"
    # Promo-specific (ignored for non-promo action types).
    discount_pct: float = Field(default=0, ge=0, le=100)
    promo_type: PromoType = "multi-buy"
    # Effort intensity for non-promo actions (ignored for "promo").
    effort_level: EffortLevel = "medium"


class SimulationResult(BaseModel):
    baseline: ForecastSeries
    simulated: ForecastSeries
    gap_before_hl: float
    gap_after_hl: float
    gap_closed_pct: float
    # Volume uplift across the selected months (simulated_hl - baseline_hl).
    lift_hl: float = 0.0
    # £ uplift = incremental Hl × gross price per hL for this SKU × channel.
    lift_gbp: float | None = None
    # £ given away through the discount = simulated_hl × discount_pct × price.
    estimated_cost: float | None = None
    # Net £ impact = lift_gbp − estimated_cost. Positive = ROI, negative = subsidy.
    net_gbp: float | None = None
    # Per-month gross price used for the £ conversion, surfaced for UI disclosure.
    gbp_per_hl: float | None = None
    # Lift multiplier actually applied (0.0-0.4ish), computed from the
    # diminishing-returns curve, not the linear scaling.
    applied_lift_pct: float = 0.0
    # Per-month event-importance boost factor (1.0 = no boost). The
    # simulator stacks promo lift × this boost per month; a HIGH event
    # month (Christmas, WC final) sees a higher boost than a quiet month.
    event_boost_avg: float = 1.0
    notes: str
