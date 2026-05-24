"""Calendar overlays for the forecast chart — UK bank holidays + major events.

Used by `/api/forecast` to annotate the chart with dashed vertical lines at
events the Commercial Manager cares about (a beer-demand context: bank
holidays, Euros, Wimbledon, etc.).

Bank holidays come from the `holidays` package (UK).
Sport / cultural fixtures are hardcoded — small, curated list, English-only
labels, anchored to the month-start so a monthly forecast can pin them.

Each event ships with an `importance` level (high / medium / low). The
simulator uses this to boost promo lift: a multi-buy that overlaps a
HIGH-importance month (World Cup final, Christmas) lifts more than the
same promo in a quiet month. See backend/app/services/forecast/simulate.py.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

import holidays as _hd

from app.schemas import CalendarEvent

EventKind = Literal["holiday", "sport", "weather"]
EventImportance = Literal["high", "medium", "low"]


# Curated UK bank holidays we annotate. Excludes weekday-noise like Good Friday
# substitutes — the FE has limited horizontal space, so we keep it to the
# moments that move beer volume. Names match `holidays` package output.
# Per-holiday importance: Christmas/Boxing/Spring BH carry the most beer
# demand uplift; minor holidays are medium / low.
_HOLIDAY_META: dict[str, tuple[str, EventImportance]] = {
    "New Year's Day":      ("New Year",   "medium"),
    "Good Friday":         ("Good Friday", "medium"),
    "Easter Monday":       ("Easter Mon", "medium"),
    "May Day":             ("May BH",     "high"),
    "Spring Bank Holiday": ("Spring BH",  "high"),
    "Summer Bank Holiday": ("Summer BH",  "high"),
    "Christmas Day":       ("Christmas",  "high"),
    "Boxing Day":          ("Boxing Day", "high"),
}


# Hardcoded sport / cultural fixtures — anchored to the month they fall in.
# Picked for likely beer impact in the UK. Importance scales with media reach:
# - HIGH: World Cup / Euros finals & openings, Boxing Day football
# - MEDIUM: Wimbledon (sustained over 2 weeks, broader audience)
# - LOW: shoulder events
_SPORT_EVENTS: list[tuple[date, str, EventImportance]] = [
    (date(2025, 6, 30),  "Wimbledon",            "medium"),
    (date(2025, 12, 26), "Boxing Day football",  "high"),
    (date(2026, 6, 11),  "World Cup opens",      "high"),
    (date(2026, 6, 28),  "Wimbledon",            "medium"),
    (date(2026, 7, 19),  "World Cup final",      "high"),
    (date(2027, 6, 11),  "Euros opens",          "high"),
    (date(2027, 7, 11),  "Euros final",          "high"),
]


def _month_start(d: date) -> str:
    """ISO yyyy-mm-dd for the first of the month containing `d`."""
    return date(d.year, d.month, 1).isoformat()


def build_events(start: date, end: date) -> list[CalendarEvent]:
    """All UK bank holidays + curated sport fixtures falling in [start, end].

    Returns events with `period` snapped to the month-start so they line up
    with monthly forecast points on the X axis. Each event carries an
    `importance` level used by the simulator's event-boost logic.
    """
    years = sorted({start.year, end.year, *range(start.year, end.year + 1)})
    uk = _hd.UnitedKingdom(years=years)

    events: list[CalendarEvent] = []
    seen_months: set[tuple[str, str]] = set()  # dedupe (month, label)

    for d, name in uk.items():
        if not (start <= d <= end):
            continue
        meta = _HOLIDAY_META.get(name)
        if meta is None:
            continue
        label, importance = meta
        month = _month_start(d)
        key = (month, label)
        if key in seen_months:
            continue
        seen_months.add(key)
        events.append(CalendarEvent(
            period=month, label=label, kind="holiday", importance=importance,
        ))

    for d, label, importance in _SPORT_EVENTS:
        if not (start <= d <= end):
            continue
        month = _month_start(d)
        key = (month, label)
        if key in seen_months:
            continue
        seen_months.add(key)
        events.append(CalendarEvent(
            period=month, label=label, kind="sport", importance=importance,
        ))

    events.sort(key=lambda e: e.period)
    return events


# ─────────────────────────────────────────────────────────────────────────────
# Lookup helpers — used by the simulator to apply event boost per month
# ─────────────────────────────────────────────────────────────────────────────

# How much extra multiplicative lift a promo gets when overlapping events
# of each importance. Conservatively chosen: HIGH adds 50% on top of the
# promo's own lift, MEDIUM 25%, LOW 10%. So a 20% promo lift inside a
# Christmas month becomes 30% (20 × 1.5).
EVENT_BOOST_MULTIPLIER: dict[EventImportance, float] = {
    "high":   1.50,
    "medium": 1.25,
    "low":    1.10,
}


def event_boost_for_month(month_iso: str, events: list[CalendarEvent]) -> float:
    """Return the multiplicative boost (1.0 = no boost) for promo lift in
    a given month, based on the highest-importance event in that month.

    Picks the strongest event when several land in the same month — a
    Christmas + Boxing Day month doesn't double-stack the boost.
    """
    in_month = [e for e in events if e.period == month_iso]
    if not in_month:
        return 1.0
    ranked = {"high": 3, "medium": 2, "low": 1}
    best = max(in_month, key=lambda e: ranked.get(e.importance, 0))
    return EVENT_BOOST_MULTIPLIER.get(best.importance, 1.0)


# Substrings identifying one-off mega-events the LightGBM model can't learn
# from history (they only happen every 2-4 years, so the training data has
# 0-1 examples). Used by the ensemble step to apply a small post-forecast
# boost ONLY for these — Christmas / Wimbledon / bank holidays are already
# baked into the model via seasonality features.
_ONEOFF_EVENT_KEYWORDS: tuple[str, ...] = (
    "World Cup",
    "Euros",
)

# Per-event multiplier for the post-forecast one-off boost.
#
# Calibrated from our own `wide_monthly.parquet`:
#   - 2023 Jun+Jul / Apr+May ratio (no major sport, baseline): 1.279
#   - 2024 Jun+Jul / Apr+May ratio (Euros 2024):               1.011
#   - 2025 Jun+Jul / Apr+May ratio (Wimbledon-only):           0.982
# Euros-vs-Wimbledon detrended lift: 1.011 / 0.982 ≈ +3% at the
# all-brand UK retail category level.
#
# Cross-check vs industry literature:
#   - WSTA / The Grocer often cite 5-15% beer lift during major tournament
#     match days, dropping to ~3-7% at the monthly aggregate
#     (most of the lift concentrates on match-day weekends rather than
#     spread across the whole month).
#
# Picked +5% as a calibrated midpoint: above our measured Euros baseline
# but conservative against the wider literature band. Applied
# unconditionally to the BASELINE forecast for one-off-event months, so
# we lean conservative to avoid overshoot.
ONEOFF_BOOST: float = 0.05  # +5% — measured from Euros 2024 detrended ratio + industry literature


def oneoff_event_boost_for_month(month_iso: str, events: list[CalendarEvent]) -> float:
    """Return a multiplicative baseline boost for months containing a one-off
    mega-event (World Cup, Euros). 1.0 = no boost.

    Distinct from `event_boost_for_month` which boosts *promo lift* during
    any high-importance month. This one boosts the *baseline forecast itself*
    for events the model can't predict from history alone.
    """
    for e in events:
        if e.period != month_iso:
            continue
        if any(k in e.label for k in _ONEOFF_EVENT_KEYWORDS):
            return 1.0 + ONEOFF_BOOST
    return 1.0
