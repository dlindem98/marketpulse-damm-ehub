"""Schemas for /api/external-signals — what the Decision page sidebar consumes."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from .forecast import CalendarEvent

TrendDirection = Literal["up", "flat", "down"]


class WeatherSignal(BaseModel):
    temp_c: float | None = None
    anomaly_c: float | None = None    # signed vs climatology


class SearchSignal(BaseModel):
    estrella: float | None = None
    lager: float | None = None
    beer: float | None = None
    estrella_trend: TrendDirection | None = None


class RetailSignal(BaseModel):
    retail_index: float | None = None
    food_drink_index: float | None = None
    food_drink_trend: TrendDirection | None = None


class ExternalSignals(BaseModel):
    period: str                        # "Dec.26"
    period_start: str                  # ISO date
    source: Literal["actuals", "prior_year"]
    source_period: str                 # ISO date the readings came from
    weather: WeatherSignal
    search: SearchSignal
    retail: RetailSignal
    events: list[CalendarEvent]
