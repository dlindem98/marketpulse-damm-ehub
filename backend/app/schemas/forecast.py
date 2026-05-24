from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ForecastPoint(BaseModel):
    period: str                      # "Nov.26"
    period_start: date
    point: float                     # Hl
    lo80: float
    hi80: float
    lo95: float
    hi95: float
    is_actual: bool = False          # true for historical months


class PromoWindow(BaseModel):
    """A past or upcoming promo period for this SKU × sub_channel.

    Used by the forecast chart to render shaded vertical bands so the user
    can see *why* a past month over/underperformed, or what's coming up.
    """
    period_start: str   # ISO yyyy-mm-dd (month-start)
    period_end: str     # ISO yyyy-mm-dd (last day of last week)
    label: str          # human-readable: "3 for £10" / "Price-cut" / "Multi-buy"
    type: Literal["price", "multibuy", "display"]


EventImportance = Literal["high", "medium", "low"]


class CalendarEvent(BaseModel):
    """A calendar event (bank holiday, sport final, etc.) relevant for beer demand.

    Rendered as a dashed vertical line with a label on the forecast chart.
    The `importance` level drives the simulator's event-boost multiplier:
    a promo overlapping a HIGH event (World Cup final, Christmas) lifts
    more than the same promo in a quiet month.
    """
    period: str         # ISO yyyy-mm-dd (month-start the event falls in)
    label: str          # "Euros final", "Easter", "Christmas Day"
    kind: Literal["holiday", "sport", "weather"]
    importance: EventImportance = "medium"


class ForecastSeries(BaseModel):
    sku: str
    sub_channel: str
    granularity: Literal["month", "week"] = "month"
    points: list[ForecastPoint] = Field(default_factory=list)
    promo_windows: list[PromoWindow] = Field(default_factory=list)
    events: list[CalendarEvent] = Field(default_factory=list)
