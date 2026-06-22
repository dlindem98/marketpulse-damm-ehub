"""External enrichment — weather, search trends, ONS retail index.

All three sources are free, no API keys required. Responses are cached to
backend/app/data/cache/ as Parquet so re-runs of `make data` are free.

Sources:
  - NASA POWER (T2M monthly mean)           https://power.larc.nasa.gov/
  - pytrends → Google Trends                no auth, polite scraping
  - ONS retail sales index                  www.ons.gov.uk/businessindustryandtrade/...

All outputs are monthly polars frames keyed by `date` (month-start). Joined
into wide_monthly.parquet by `etl.py::attach_external()`.
"""

from __future__ import annotations

import time
from datetime import date, timedelta

import httpx
import polars as pl

from app.paths import CACHE_DIR as CACHE

CACHE.mkdir(parents=True, exist_ok=True)


# ────────────────────────────────────────────────────────────────────────────
# Weather — NASA POWER monthly mean temperature
# ────────────────────────────────────────────────────────────────────────────

# UK-centroid-ish (Birmingham/Manchester corridor)
UK_LAT, UK_LON = 52.5, -1.5
WEATHER_CACHE = CACHE / "weather_uk_monthly.parquet"
NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"


def fetch_uk_weather(
    start: date, end: date, *, max_age_hours: int = 24,
) -> pl.DataFrame:
    """UK monthly mean temperature (Celsius) + same-month 5-yr anomaly.

    Returns columns: date, temp_c_mean, temp_c_anomaly.

    NASA POWER has data through Dec 2025. For 2026 months we impute the
    temp_c_mean from the 5-year same-month climatological average (which is
    also what the anomaly definition reduces to when there's no observation).
    The anomaly for imputed months is 0 by definition.
    """
    if (WEATHER_CACHE.is_file()
        and (time.time() - WEATHER_CACHE.stat().st_mtime) < max_age_hours * 3600):
        df = pl.read_parquet(WEATHER_CACHE)
        if df["date"].min() <= start and df["date"].max() >= end - timedelta(days=31):
            return df.filter((pl.col("date") >= start) & (pl.col("date") <= end))

    # Pull 5 years before `start` to compute a stable seasonal baseline
    history_start_year = start.year - 5
    nasa_end_year = min(end.year, 2025)  # POWER's hard ceiling currently

    print(f"  · fetching NASA POWER T2M  {history_start_year}-01 → {nasa_end_year}-12")
    r = httpx.get(NASA_POWER_URL, params={
        "parameters": "T2M",
        "community": "AG",
        "longitude": UK_LON, "latitude": UK_LAT,
        "start": str(history_start_year),
        "end":   str(nasa_end_year),
        "format": "JSON",
    }, timeout=60)
    r.raise_for_status()
    body = r.json()
    t2m = body["properties"]["parameter"]["T2M"]

    rows = []
    for k, v in t2m.items():
        # NASA POWER keys: "YYYYMM"; also emits "YYYY13" = annual mean — skip
        if len(k) != 6 or k.endswith("13"):
            continue
        try:
            y, m = int(k[:4]), int(k[4:6])
            if 1 <= m <= 12 and float(v) > -999:  # POWER's "no data" sentinel
                rows.append({"date": date(y, m, 1), "temp_c_mean": float(v)})
        except (ValueError, TypeError):
            continue

    df = pl.DataFrame(rows).sort("date").with_columns(
        month=pl.col("date").dt.month(),
    )

    # Climatology = mean temp_c_mean per calendar month across full history
    monthly_clim = (
        df.group_by("month")
        .agg(pl.col("temp_c_mean").mean().alias("climatology"))
    )
    df = df.join(monthly_clim, on="month", how="left").with_columns(
        temp_c_anomaly=(pl.col("temp_c_mean") - pl.col("climatology")),
    ).select(["date", "temp_c_mean", "temp_c_anomaly", "climatology", "month"])

    # Strip helper columns first so concat schemas line up
    base = df.select(["date", "temp_c_mean", "temp_c_anomaly"])

    # Extend to `end` by climatology imputation for any future months
    months_to_fill = []
    y, m = nasa_end_year, 12
    while True:
        m += 1
        if m > 12:
            m = 1; y += 1
        d = date(y, m, 1)
        if d > end:
            break
        months_to_fill.append(d)

    if months_to_fill:
        clim_lookup = {row["month"]: row["climatology"] for row in monthly_clim.to_dicts()}
        fill_df = pl.DataFrame({
            "date": months_to_fill,
            "temp_c_mean":    [float(clim_lookup.get(d.month, 0.0)) for d in months_to_fill],
            "temp_c_anomaly": [0.0] * len(months_to_fill),
        })
        base = pl.concat([base, fill_df], how="vertical")

    out = base.sort("date")
    out.write_parquet(WEATHER_CACHE)
    return out.filter((pl.col("date") >= start) & (pl.col("date") <= end))


# ────────────────────────────────────────────────────────────────────────────
# Google Trends via pytrends
# ────────────────────────────────────────────────────────────────────────────

TRENDS_CACHE = CACHE / "google_trends_uk.parquet"
TRENDS_TERMS = ["estrella damm", "lager", "beer"]


def fetch_google_trends(
    start: date, end: date, *, max_age_hours: int = 24,
) -> pl.DataFrame:
    """Monthly Google Trends UK interest. Columns: trends_estrella, trends_lager, trends_beer.

    Values are 0-100 normalized within the query batch (Google's standard).
    """
    if (TRENDS_CACHE.is_file()
        and (time.time() - TRENDS_CACHE.stat().st_mtime) < max_age_hours * 3600):
        df = pl.read_parquet(TRENDS_CACHE)
        if df["date"].min() <= start and df["date"].max() >= end - timedelta(days=31):
            return df.filter((pl.col("date") >= start) & (pl.col("date") <= end))

    from pytrends.request import TrendReq

    timeframe = f"{start.isoformat()} {end.isoformat()}"
    print(f"  · fetching Google Trends UK {timeframe}")
    # retries=0 to bypass pytrends's old urllib3 Retry API incompatibility
    py = TrendReq(hl="en-GB", tz=0, timeout=(10, 30), retries=0)
    py.build_payload(kw_list=TRENDS_TERMS, cat=0, timeframe=timeframe, geo="GB")
    df_w = py.interest_over_time()

    if df_w is None or df_w.empty:
        months = pl.date_range(start, end, interval="1mo", eager=True)
        return pl.DataFrame({
            "date": months,
            "trends_estrella": [0.0] * len(months),
            "trends_lager":    [0.0] * len(months),
            "trends_beer":     [0.0] * len(months),
        })

    df = (
        pl.from_pandas(df_w.reset_index())
        .with_columns(pl.col("date").cast(pl.Date))
        .with_columns(date=pl.col("date").dt.truncate("1mo"))
        .group_by("date")
        .agg(*[pl.col(t).mean() for t in TRENDS_TERMS])
        .rename({
            "estrella damm": "trends_estrella",
            "lager":         "trends_lager",
            "beer":          "trends_beer",
        })
        .sort("date")
        .with_columns(
            pl.col("trends_estrella").cast(pl.Float64),
            pl.col("trends_lager").cast(pl.Float64),
            pl.col("trends_beer").cast(pl.Float64),
        )
    )
    df.write_parquet(TRENDS_CACHE)
    return df


# ────────────────────────────────────────────────────────────────────────────
# ONS retail sales index
# ────────────────────────────────────────────────────────────────────────────

ONS_CACHE = CACHE / "ons_retail.parquet"
ONS_BASE = "https://www.ons.gov.uk/businessindustryandtrade/retailindustry/timeseries"
ONS_SERIES: list[tuple[str, str]] = [
    ("eafv", "ons_retail_index"),       # All retailers, value, monthly, NSA
    ("j5ek", "ons_food_drink_index"),   # Predominantly food stores, value, NSA
]
ONS_MONTH_MAP = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}


def _fetch_one_ons(series_id: str) -> pl.DataFrame | None:
    url = f"{ONS_BASE}/{series_id}/drsi/data"
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    body = r.json()
    months = body.get("months") or []
    if not months:
        return None
    rows = []
    for m in months:
        d_str = m.get("date") or m.get("name") or ""
        try:
            year_str, mon_str = d_str.split()
            d = date(int(year_str), ONS_MONTH_MAP[mon_str.upper()[:3]], 1)
        except (ValueError, KeyError):
            continue
        val = m.get("value")
        if val in (None, "", ".."):
            continue
        try:
            rows.append({"date": d, "value": float(val)})
        except (TypeError, ValueError):
            continue
    return pl.DataFrame(rows) if rows else None


def fetch_ons_retail(
    start: date, end: date, *, max_age_hours: int = 24,
) -> pl.DataFrame:
    """UK retail sales indices. Returns date + ons_retail_index + ons_food_drink_index."""
    if (ONS_CACHE.is_file()
        and (time.time() - ONS_CACHE.stat().st_mtime) < max_age_hours * 3600):
        df = pl.read_parquet(ONS_CACHE)
        if df["date"].min() <= start and df["date"].max() >= end - timedelta(days=31):
            return df.filter((pl.col("date") >= start) & (pl.col("date") <= end))

    print(f"  · fetching ONS retail series ({len(ONS_SERIES)} series)")
    pieces: list[pl.DataFrame] = []
    for series_id, col_name in ONS_SERIES:
        df = _fetch_one_ons(series_id)
        if df is None or len(df) == 0:
            print(f"    · ONS {series_id}: no data — skipping")
            continue
        pieces.append(df.rename({"value": col_name}))
        print(f"    · ONS {series_id} → {col_name}: {len(df)} months")

    if not pieces:
        months = pl.date_range(start, end, interval="1mo", eager=True)
        out = pl.DataFrame({"date": months}).with_columns(
            *[pl.lit(0.0).alias(c[1]) for c in ONS_SERIES]
        )
    else:
        out = pieces[0]
        for p in pieces[1:]:
            out = out.join(p, on="date", how="full", coalesce=True)
        out = out.sort("date").fill_null(strategy="forward").fill_null(strategy="backward").fill_null(0.0)

    out.write_parquet(ONS_CACHE)
    return out.filter((pl.col("date") >= start) & (pl.col("date") <= end))


# ────────────────────────────────────────────────────────────────────────────
# Assemble all sources into a single monthly frame
# ────────────────────────────────────────────────────────────────────────────

def fetch_all_external(start: date, end: date) -> pl.DataFrame:
    """Pull all sources and join into a single monthly frame keyed by date.

    Robust to individual source failures: any source that errors gets a
    zero-filled column scaffold so downstream ML still has the column
    schema it expects.
    """
    pieces: list[pl.DataFrame] = []
    expected_columns: list[str] = []
    for label, fn, cols in [
        ("weather",       lambda: fetch_uk_weather(start, end),     ["temp_c_mean", "temp_c_anomaly"]),
        ("google_trends", lambda: fetch_google_trends(start, end),  ["trends_estrella", "trends_lager", "trends_beer"]),
        ("ons_retail",    lambda: fetch_ons_retail(start, end),     ["ons_retail_index", "ons_food_drink_index"]),
    ]:
        expected_columns.extend(cols)
        try:
            df = fn()
            pieces.append(df)
            print(f"  · {label}: ok ({len(df)} rows)")
        except Exception as e:
            print(f"  ! {label} failed: {type(e).__name__}: {e}")

    if not pieces:
        months = pl.date_range(start, end, interval="1mo", eager=True)
        out = pl.DataFrame({"date": months})
        for c in expected_columns:
            out = out.with_columns(pl.lit(0.0).alias(c))
        return out

    out = pieces[0]
    for p in pieces[1:]:
        out = out.join(p, on="date", how="full", coalesce=True)
    out = out.sort("date")
    # Fill any column entirely missing with zeros so downstream schema is stable
    for c in expected_columns:
        if c not in out.columns:
            out = out.with_columns(pl.lit(0.0).alias(c))
    return out


if __name__ == "__main__":
    df = fetch_all_external(date(2023, 1, 1), date(2026, 4, 1))
    print(df)
