"""Schemas for the portfolio-level aggregate endpoints (pulse + rollups)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class BrandRollup(BaseModel):
    brand: str
    forecast: float
    target: float
    gap_pct: float
    gap_hl: float
    gap_gbp: float | None = None   # gap_hl * brand £/hL rate; None if unknown
    n_skus: int


class SubChannelRollup(BaseModel):
    name: str            # human label
    code: str            # raw sub_channel
    forecast: float
    target: float
    gap_pct: float
    gap_hl: float
    gap_gbp: float | None = None


class WorstSlice(BaseModel):
    """Used for both `worst_brand` and `worst_channel` in the pulse response."""

    name: str
    gap_hl: float
    gap_pct: float
    gap_gbp: float | None = None
    code: str | None = None       # only set for channels


class Pulse(BaseModel):
    """Headline answer to the brief's "will this month close above/below
    budget?" question. Single period, aggregated across all SKUs and channels.
    """

    period: str                   # "May.26"
    period_start: str             # ISO yyyy-mm-dd
    total_forecast_hl: float
    total_target_hl: float
    gap_hl: float
    gap_pct: float
    gap_gbp: float | None = None  # gap_hl * portfolio £/hL; None if unknown
    gbp_per_hl: float | None = None  # the rate used, for UI disclosure
    confidence: Literal["low", "medium", "high"]
    n_skus_at_risk: int
    worst_brand: WorstSlice | None = None
    worst_channel: WorstSlice | None = None
