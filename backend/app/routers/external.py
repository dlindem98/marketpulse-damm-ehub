"""GET /api/external-signals — surface the external context behind a forecast.

The brief explicitly values external enrichment that's "documented and
integrated with Damm data". This endpoint exposes what the model already
consumes (wide_monthly.parquet's external columns) so the Decision page can
show the analyst *why* the forecast looks the way it does:

  - weather anomaly (NASA POWER)
  - category search interest (Google Trends via pytrends)
  - macro retail trend (ONS retail sales index)
  - calendar events for the target month (UK holidays + curated sport)

Future months don't have actuals; we pull the prior-year same-month as a
seasonal proxy and label it accordingly, rather than fabricating numbers.
"""

from __future__ import annotations

from datetime import date as date_t
from datetime import datetime, timedelta
from functools import lru_cache

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.paths import snapshot_path
from app.schemas import (
    ExternalSignals,
    ExternalSignalsTimeline,
    PeriodSignals,
    RetailSignal,
    SearchSignal,
    WeatherSignal,
)
from app.services.calendar import build_events

router = APIRouter(prefix="/api", tags=["external"])

WIDE = snapshot_path("wide_monthly.parquet")


@lru_cache(maxsize=1)
def _wide() -> pl.DataFrame:
    if not WIDE.is_file():
        raise HTTPException(503, "wide_monthly.parquet missing — run make etl")
    return pl.read_parquet(WIDE)


def _parse_period(period: str | None) -> date_t | None:
    if not period:
        return None
    p = period.strip()
    if "." in p:
        try:
            return datetime.strptime(p, "%b.%y").date().replace(day=1)
        except ValueError:
            return None
    if p.count("-") == 1:
        try:
            return datetime.strptime(p + "-01", "%Y-%m-%d").date()
        except ValueError:
            return None
    try:
        return datetime.strptime(p, "%Y-%m-%d").date().replace(day=1)
    except ValueError:
        return None


def _resolve_period(wide: pl.DataFrame, target: date_t) -> tuple[date_t, str]:
    """Pick the row to read externals from.

    - If `target` has actuals, use it directly. Source label "actuals".
    - Otherwise fall back to the same calendar month from the most recent
      year we *do* have data for. Source label "prior_year".
    """
    available = set(wide["date"].unique().to_list())
    if target in available:
        return target, "actuals"

    # Walk back year by year until a same-month sibling shows up.
    probe = target
    for _ in range(5):
        probe = probe.replace(year=probe.year - 1)
        if probe in available:
            return probe, "prior_year"
    raise HTTPException(404, f"no external data for {target.isoformat()}")


def _trend(curr: float | None, prev: float | None) -> str | None:
    """Human direction label for two scalar readings (curr vs prev)."""
    if curr is None or prev is None:
        return None
    if prev == 0:
        return None
    delta = (curr - prev) / abs(prev)
    if delta > 0.05:
        return "up"
    if delta < -0.05:
        return "down"
    return "flat"


@router.get("/external-signals", response_model=ExternalSignals)
def external_signals(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    period: str | None = Query(default=None, description='"Nov.26" or "2026-11"'),
):
    """Per-SKU × sub_channel external context for a target period.

    Returns a compact bundle the Decision page can render in a sidebar:
      - weather: avg temperature + anomaly vs climatology
      - search: Estrella/lager/beer interest (0-100 Google Trends)
      - retail: ONS retail + food/drink index
      - events: UK holidays + sport in that month
      - source: "actuals" or "prior_year" (so the UI can disclose proxy use)
    """
    wide = _wide()
    target = _parse_period(period) or sorted(wide["date"].unique().to_list())[-1]
    resolved, source = _resolve_period(wide, target)

    # Externals at month-level are constant across SKU×channel, but we still
    # filter to one row to validate the row exists for that combination —
    # avoids surfacing context for a non-existent slice.
    rows = wide.filter(
        (pl.col("material_id") == sku)
        & (pl.col("sub_channel") == sub_channel)
        & (pl.col("date") == resolved)
    )
    if len(rows) == 0:
        # Fallback to *any* row at that date — externals are still meaningful
        # even if this exact SKU×channel didn't ship that month.
        rows = wide.filter(pl.col("date") == resolved).head(1)
        if len(rows) == 0:
            raise HTTPException(404, f"no external data at {resolved.isoformat()}")

    row = rows.row(0, named=True)

    # Prior reading (one month earlier) for trend deltas.
    prev_date = resolved.replace(day=1) - timedelta(days=1)
    prev_date = prev_date.replace(day=1)
    prev_rows = wide.filter(pl.col("date") == prev_date).head(1)
    prev = prev_rows.row(0, named=True) if len(prev_rows) else {}

    def num(r: dict, key: str) -> float | None:
        v = r.get(key)
        return float(v) if v is not None else None

    weather = WeatherSignal(
        temp_c=num(row, "temp_c_mean"),
        anomaly_c=num(row, "temp_c_anomaly"),
    )
    search = SearchSignal(
        estrella=num(row, "trends_estrella"),
        lager=num(row, "trends_lager"),
        beer=num(row, "trends_beer"),
        estrella_trend=_trend(num(row, "trends_estrella"), num(prev, "trends_estrella")),  # type: ignore[arg-type]
    )
    retail = RetailSignal(
        retail_index=num(row, "ons_retail_index"),
        food_drink_index=num(row, "ons_food_drink_index"),
        food_drink_trend=_trend(num(row, "ons_food_drink_index"), num(prev, "ons_food_drink_index")),  # type: ignore[arg-type]
    )

    # Calendar events for the target month (regardless of source — the events
    # are real for the calendar month the user is asking about).
    month_start = target.replace(day=1)
    # Last day of month
    if month_start.month == 12:
        month_end = date_t(month_start.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date_t(month_start.year, month_start.month + 1, 1) - timedelta(days=1)
    events = build_events(month_start, month_end)

    return ExternalSignals(
        period=target.strftime("%b.%y"),
        period_start=target.isoformat(),
        source=source,  # type: ignore[arg-type]
        source_period=resolved.isoformat(),
        weather=weather,
        search=search,
        retail=retail,
        events=events,
    )


# ─────────────────────────────────────────────────────────────────────────────
# /api/external-signals/timeline — per-month signals across a horizon
# ─────────────────────────────────────────────────────────────────────────────


def _month_starts(start: date_t, end: date_t) -> list[date_t]:
    """Yield first-of-month dates from `start` (inclusive) to `end` (inclusive)."""
    out: list[date_t] = []
    cur = date_t(start.year, start.month, 1)
    last = date_t(end.year, end.month, 1)
    while cur <= last:
        out.append(cur)
        if cur.month == 12:
            cur = date_t(cur.year + 1, 1, 1)
        else:
            cur = date_t(cur.year, cur.month + 1, 1)
    return out


@router.get("/external-signals/timeline", response_model=ExternalSignalsTimeline)
def external_signals_timeline(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
):
    """Per-month external signals for the chart's storytelling layer.

    Used by the forecast chart's tooltip and signal-track strip so the
    user can see *which months* are touched by an event, a heatwave, or
    a search-trend spike — at a glance, without leaving the chart.
    """
    wide = _wide()
    available = sorted(wide["date"].unique().to_list())
    if not available:
        return ExternalSignalsTimeline(sku=sku, sub_channel=sub_channel, months=[])

    # Default window covers the forecast horizon, not just the actuals
    # window. The forecast lives ~9 months past the last actual; without
    # a wider default, callers asking for Sep.26 etc. get an empty list
    # and the Decision page's External-context card shows "No signals".
    # We anchor on the latest actual and expand 6 months back / 18 ahead
    # so both the recent past and the full forecast horizon are covered.
    last_actual = available[-1]
    if last_actual.month > 6:
        default_start = date_t(last_actual.year, last_actual.month - 6, 1)
    else:
        default_start = date_t(last_actual.year - 1, last_actual.month + 6, 1)
    end_month = last_actual.month + 18
    end_year = last_actual.year + (end_month - 1) // 12
    end_month = ((end_month - 1) % 12) + 1
    default_end = date_t(end_year, end_month, 1)

    start = _parse_period(period_from) or default_start
    end = _parse_period(period_to) or default_end

    months: list[PeriodSignals] = []
    for m in _month_starts(start, end):
        resolved, source = _resolve_period(wide, m)
        rows = wide.filter(pl.col("date") == resolved).head(1)
        if len(rows) == 0:
            continue
        row = rows.row(0, named=True)

        # Build prior-month lookup for trend deltas — same shape as the
        # per-period endpoint above.
        prev_date = resolved.replace(day=1) - timedelta(days=1)
        prev_date = prev_date.replace(day=1)
        prev_rows = wide.filter(pl.col("date") == prev_date).head(1)
        prev = prev_rows.row(0, named=True) if len(prev_rows) else {}

        def num(r: dict, key: str) -> float | None:
            v = r.get(key)
            return float(v) if v is not None else None

        # Events for the *actual* month asked about (not the proxy source).
        m_start = m
        if m_start.month == 12:
            m_end = date_t(m_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            m_end = date_t(m_start.year, m_start.month + 1, 1) - timedelta(days=1)
        events = build_events(m_start, m_end)

        months.append(PeriodSignals(
            period=m.strftime("%b.%y"),
            period_start=m.isoformat(),
            source=source,  # type: ignore[arg-type]
            weather=WeatherSignal(
                temp_c=num(row, "temp_c_mean"),
                anomaly_c=num(row, "temp_c_anomaly"),
            ),
            search=SearchSignal(
                estrella=num(row, "trends_estrella"),
                lager=num(row, "trends_lager"),
                beer=num(row, "trends_beer"),
                estrella_trend=_trend(num(row, "trends_estrella"), num(prev, "trends_estrella")),  # type: ignore[arg-type]
            ),
            retail=RetailSignal(
                retail_index=num(row, "ons_retail_index"),
                food_drink_index=num(row, "ons_food_drink_index"),
                food_drink_trend=_trend(num(row, "ons_food_drink_index"), num(prev, "ons_food_drink_index")),  # type: ignore[arg-type]
            ),
            events=events,
        ))

    return ExternalSignalsTimeline(sku=sku, sub_channel=sub_channel, months=months)
