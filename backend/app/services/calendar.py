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
# Importance is graded by *beer demand impact*, not religious or civic
# significance. Two reclassifications vs the initial set:
#   - New Year's Day → low. Most consumption happened NYE the night before;
#     Jan 1 is the hungover recovery day. (NYE itself isn't a UK bank
#     holiday so doesn't appear here.)
#   - Good Friday → low. Religious holiday; pubs traditionally closed and
#     the food side leans fish-focused. Weak beer driver.
_HOLIDAY_META: dict[str, tuple[str, EventImportance]] = {
    "New Year's Day":      ("New Year",   "low"),
    "Good Friday":         ("Good Friday", "low"),
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


# Per-event-label post-forecast boost. KEY PRINCIPLE: only boost events
# the per-(brand × sub_channel × month) seasonality multiplier in
# services/seasonality.py *can't* capture — otherwise we double-count.
#
# Seasonality already lifts December by ~1.14-1.44× and May by ~1.4× for
# the major brands (recovered from real historical actuals), so layering
# a Christmas / May BH / Summer BH boost on top would push those months
# above reality. The post-forecast boost is therefore limited to events
# that are either:
#   · non-annual (every 2-4 years) — the model has 0-1 training examples
#   · date-shifting across months year-to-year — seasonality can't peg
#     them to a stable month
# Everything else stays at 0% (seasonality multiplier handles it; or low
# beer impact in the first place).
#
# Calibration:
#   - World Cup / Euros: +20%. DEMO AMPLIFICATION. Originally calibrated
#     at +5% from our own wide_monthly Euros 2024 detrended ratio (~+3%)
#     and WSTA / Grocer literature (+3-7% monthly, 5-15% match-day
#     weekends). At +5% the bump was buried in the surrounding noise on
#     the chart, so this was raised to +20% to make the tournament month
#     visibly distinct in the demo. This is ABOVE the measured /
#     literature range — treat as a demo dial, not a calibrated estimate.
#     A real production system should keep this near the measured +5%
#     and reach for a richer source if the chart needs more drama.
#   - Wimbledon: +2%. Kept at measured-range value — sustained 2-week
#     sport-pub event on top of the summer baseline, narrower audience
#     than football tournaments.
#   - Easter Monday: +3%. The one bank holiday that shifts months
#     (late Mar to mid-Apr) so seasonality smooths it across both,
#     under-counting whichever month Easter actually lands in.
#
# Matched on substring of event.label so multiple events sharing the same
# pattern (e.g. "World Cup opens" and "World Cup final") get the same
# boost without listing every variant.
POST_FORECAST_BOOST: dict[str, float] = {
    "World Cup":   0.20,  # demo-amplified above the measured +3-7% band
    "Euros":       0.20,  # demo-amplified above the measured +3-7% band
    "Wimbledon":   0.02,
    "Easter Mon":  0.03,
}


def post_forecast_boost_for_month(month_iso: str, events: list[CalendarEvent]) -> float:
    """Multiplicative baseline boost for a month, based on any events that
    aren't already captured by the per-month seasonality multiplier.
    Returns 1.0 when no qualifying event lands in the month.

    Distinct from `event_boost_for_month` which boosts *promo lift* during
    high-importance months. This one boosts the *baseline forecast itself*
    in the ensemble step — see services/forecast/ensemble.py.

    When multiple qualifying events land in the same month (e.g.
    Wimbledon + Euros final both in July) we apply the *largest* boost,
    not the sum, to stay conservative.
    """
    best_boost = 0.0
    for e in events:
        if e.period != month_iso:
            continue
        for keyword, boost in POST_FORECAST_BOOST.items():
            if keyword in e.label and boost > best_boost:
                best_boost = boost
    return 1.0 + best_boost


# Backwards-compat alias — keep `oneoff_event_boost_for_month` working
# until callers are updated. Same semantics now: returns the best
# qualifying boost for the month.
oneoff_event_boost_for_month = post_forecast_boost_for_month
