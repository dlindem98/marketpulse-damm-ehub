from typing import Literal

from pydantic import BaseModel


class GapItem(BaseModel):
    sku: str
    sub_channel: str
    period: str                      # "Nov.26"
    forecast_hl: float
    budget_hl: float
    gap_hl: float                    # forecast - budget
    gap_pct: float                   # gap_hl / budget_hl
    confidence: Literal["low", "medium", "high"] = "medium"
    # NEW: trailing gap_hl history (last ~12 periods, oldest→newest). Data is
    # monthly in this repo, so this is a 12-month rolling window. May be shorter
    # or empty if a SKU is new — frontend handles that gracefully.
    history_hl: list[float] = []
    # NEW: previous period's gap_pct (for "▼ -3.2pp vs last week" delta cell).
    # None when there's no prior period in the joined data.
    prev_week_gap_pct: float | None = None


class KpiSummary(BaseModel):
    total_forecast_hl: float
    total_budget_hl: float
    gap_hl: float
    gap_pct: float
    on_track_skus: int
    off_track_skus: int
    period_range: tuple[str, str]    # e.g. ("Sep.26", "Dec.26")
