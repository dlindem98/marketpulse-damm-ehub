"""Distribute monthly forecast points across ISO weeks.

Why: the data snapshots are monthly, but the brief asks for week and month.
Rather than fake weekly numbers, we derive them deterministically from the
monthly point by pro-rating each ISO week's share by the days it has inside
the month.

Example
-------
August 2026 has 31 days. ISO weeks touching August:
  Wk31 (Jul 27 – Aug 02): 2 Aug days  →  2/31 of August's Hl
  Wk32 (Aug 03 – Aug 09): 7 Aug days  →  7/31
  Wk33 (Aug 10 – Aug 16): 7 Aug days  →  7/31
  Wk34 (Aug 17 – Aug 23): 7 Aug days  →  7/31
  Wk35 (Aug 24 – Aug 30): 7 Aug days  →  7/31
  Wk36 (Aug 31 – Sep 06): 1 Aug day   →  1/31
Confidence bands (p10/p90) distribute proportionally. The sum across weeks
within a month equals the monthly point — by construction.

When real weekly snapshots ship, swap this for a true weekly forecast call.
The endpoint contract stays the same so the frontend doesn't change.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class MonthlyPoint:
    period: str          # e.g. "Nov.26"
    period_start: date   # first of the month
    point: float
    lo80: float
    hi80: float
    is_actual: bool = False


@dataclass(frozen=True)
class WeeklyPoint:
    period: str          # e.g. "Wk44 '26"
    period_start: date   # Monday of the ISO week
    point: float
    lo80: float
    hi80: float
    is_actual: bool = False


def _iso_week_label(monday: date) -> str:
    iso_year, iso_week, _ = monday.isocalendar()
    return f"Wk{iso_week:02d} '{str(iso_year)[-2:]}"


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_first = date(year + 1, 1, 1)
    else:
        next_first = date(year, month + 1, 1)
    return (next_first - date(year, month, 1)).days


def _weeks_for_month(year: int, month: int) -> list[tuple[date, int]]:
    """Return (week_monday, days_of_that_week_inside_the_month) tuples,
    ordered chronologically and covering every day of the month.
    """
    total = _days_in_month(year, month)
    first = date(year, month, 1)
    last = first + timedelta(days=total - 1)

    # Walk Mondays starting from the Monday of (or before) `first`.
    first_monday = first - timedelta(days=first.weekday())
    out: list[tuple[date, int]] = []
    monday = first_monday
    while monday <= last:
        # Count days of this Mon-Sun window that fall inside [first, last].
        window_end = monday + timedelta(days=6)
        overlap_start = max(monday, first)
        overlap_end = min(window_end, last)
        days_in = (overlap_end - overlap_start).days + 1 if overlap_end >= overlap_start else 0
        if days_in > 0:
            out.append((monday, days_in))
        monday = monday + timedelta(days=7)
    return out


def split_monthly_to_weekly(points: list[MonthlyPoint]) -> list[WeeklyPoint]:
    """Pro-rata weekly distribution. Sum within a month == monthly point.

    Edge weeks that span two months produce one row per month — that's correct
    behaviour for charts (the user sees the weekly bar split across the boundary).
    """
    out: list[WeeklyPoint] = []
    for mp in points:
        y, m = mp.period_start.year, mp.period_start.month
        total = _days_in_month(y, m)
        for monday, days_in in _weeks_for_month(y, m):
            share = days_in / total
            out.append(
                WeeklyPoint(
                    period=_iso_week_label(monday),
                    period_start=monday,
                    point=mp.point * share,
                    lo80=mp.lo80 * share,
                    hi80=mp.hi80 * share,
                    is_actual=mp.is_actual,
                )
            )
    # If two adjacent monthly points share a boundary week, the loop above
    # produces two rows for that Monday (one per month, each holding its
    # respective days). Collapse them into one combined row.
    merged: dict[date, WeeklyPoint] = {}
    for w in out:
        prev = merged.get(w.period_start)
        if prev is None:
            merged[w.period_start] = w
        else:
            merged[w.period_start] = WeeklyPoint(
                period=w.period,
                period_start=w.period_start,
                point=prev.point + w.point,
                lo80=prev.lo80 + w.lo80,
                hi80=prev.hi80 + w.hi80,
                is_actual=prev.is_actual or w.is_actual,
            )
    return [merged[k] for k in sorted(merged.keys())]
