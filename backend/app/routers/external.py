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
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import ExternalSignals, RetailSignal, SearchSignal, WeatherSignal
from app.services.calendar import build_events

router = APIRouter(prefix="/api", tags=["external"])

WIDE = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "wide_monthly.parquet"


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
