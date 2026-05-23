"""Calendar overlays for the forecast chart — UK bank holidays + major events.

Used by `/api/forecast` to annotate the chart with dashed vertical lines at
events the Commercial Manager cares about (a beer-demand context: bank
holidays, Euros, Wimbledon, etc.).

Bank holidays come from the `holidays` package (UK).
Sport / cultural fixtures are hardcoded — small, curated list, English-only
labels, anchored to the month-start so a monthly forecast can pin them.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

import holidays as _hd

from app.schemas import CalendarEvent

EventKind = Literal["holiday", "sport", "weather"]


# Curated UK bank holidays we annotate. Excludes weekday-noise like Good Friday
# substitutes — the FE has limited horizontal space, so we keep it to the
# moments that move beer volume. Names match `holidays` package output.
_KEEP_HOLIDAYS: frozenset[str] = frozenset({
    "New Year's Day",
    "Good Friday",
    "Easter Monday",
    "May Day",
    "Spring Bank Holiday",
    "Summer Bank Holiday",
    "Christmas Day",
    "Boxing Day",
})

# Short labels — bank-holiday names are too long for chart annotations.
_HOLIDAY_LABEL_OVERRIDES: dict[str, str] = {
    "New Year's Day": "New Year",
    "May Day": "May BH",
    "Spring Bank Holiday": "Spring BH",
    "Summer Bank Holiday": "Summer BH",
    "Christmas Day": "Christmas",
    "Boxing Day": "Boxing Day",
}


# Hardcoded sport / cultural fixtures — anchored to the month they fall in.
# Picked for likely beer impact in the UK.
_SPORT_EVENTS: list[tuple[date, str]] = [
    (date(2025, 6, 30), "Wimbledon"),
    (date(2025, 12, 26), "Boxing Day football"),
    (date(2026, 6, 11), "World Cup opens"),
    (date(2026, 6, 28), "Wimbledon"),
    (date(2026, 7, 19), "World Cup final"),
    (date(2027, 6, 11), "Euros opens"),
    (date(2027, 7, 11), "Euros final"),
]


def _month_start(d: date) -> str:
    """ISO yyyy-mm-dd for the first of the month containing `d`."""
    return date(d.year, d.month, 1).isoformat()


def build_events(start: date, end: date) -> list[CalendarEvent]:
    """All UK bank holidays + curated sport fixtures falling in [start, end].

    Returns events with `period` snapped to the month-start so they line up
    with monthly forecast points on the X axis.
    """
    years = sorted({start.year, end.year, *range(start.year, end.year + 1)})
    uk = _hd.UnitedKingdom(years=years)

    events: list[CalendarEvent] = []
    seen_months: set[tuple[str, str]] = set()  # dedupe (month, label)

    for d, name in uk.items():
        if not (start <= d <= end):
            continue
        if name not in _KEEP_HOLIDAYS:
            continue
        label = _HOLIDAY_LABEL_OVERRIDES.get(name, name)
        month = _month_start(d)
        key = (month, label)
        if key in seen_months:
            continue
        seen_months.add(key)
        events.append(CalendarEvent(period=month, label=label, kind="holiday"))

    for d, label in _SPORT_EVENTS:
        if not (start <= d <= end):
            continue
        month = _month_start(d)
        key = (month, label)
        if key in seen_months:
            continue
        seen_months.add(key)
        events.append(CalendarEvent(period=month, label=label, kind="sport"))

    events.sort(key=lambda e: e.period)
    return events
