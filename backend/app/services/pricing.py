"""Gross-price-per-hectolitre estimation.

The brief's coordinator clarified that teams may approximate the "normal"
beer price (before promos / rebates / commercial adjustments) as:

    gross_price_per_hL = Gross sales / Hectolitres sold

We don't have a true gross-sales column — the ETL source maps Spanish
`Venta Neta` (Net Sales) into `revenue_gbp`. At the **aggregate** level
across many promo + non-promo months, the resulting £/hL average still
approximates the unit value the coordinator describes: it averages out the
discount periods against the regular ones. We surface it as a "proxy"
throughout the UI so the demo doesn't overclaim precision.

Unit assumption
---------------
Raw `revenue_gbp / Hl` on `wide_monthly.parquet` lands at ~0.22 for
ESTRELLA DAMM (the highest-volume brand). UK wholesale lager runs roughly
£150-300 per hectolitre, so the source values are almost certainly in
**thousands** of GBP. We multiply by `REVENUE_SCALE_TO_GBP = 1000`
when computing the rate. If the ETL is ever corrected to ship raw GBP,
flip the constant to 1.0 — the rate stays in £/hL throughout the app.
"""

from __future__ import annotations

from datetime import date as date_t
from functools import lru_cache

import polars as pl

from app.paths import snapshot_path

# See docstring — multiplier applied to the source revenue values to get
# a real GBP figure. Set conservatively from inspection of source data;
# verify against any official price-list if one is shared.
REVENUE_SCALE_TO_GBP = 1000.0

# Fallback when a filter slice has zero observations. Set to None so callers
# can decide whether to hide the £ figure entirely (preferred) or show this.
DEFAULT_PRICE_FALLBACK: float | None = None

WIDE = snapshot_path("wide_monthly.parquet")


@lru_cache(maxsize=1)
def _wide() -> pl.DataFrame:
    if not WIDE.is_file():
        # Caller decides how to respond — pricing shouldn't 500 the whole API
        # if the ETL hasn't run. Empty frame leads to None-priced everything.
        return pl.DataFrame()
    df = pl.read_parquet(WIDE)
    return df.filter((pl.col("Hl") > 0) & (pl.col("revenue_gbp") > 0))


def gross_price_per_hl(
    *,
    sku: str | None = None,
    brand: str | None = None,
    sub_channel: str | None = None,
    period_from: date_t | None = None,
    period_to: date_t | None = None,
) -> tuple[float | None, int]:
    """Return (price_gbp_per_hl, n_rows) for the requested slice.

    `n_rows` is the number of (sku × sub_channel × month) cells averaged.
    When zero, returns (DEFAULT_PRICE_FALLBACK, 0).
    """
    df = _wide()
    if len(df) == 0:
        return DEFAULT_PRICE_FALLBACK, 0

    if sku:
        df = df.filter(pl.col("material_id") == sku)
    if brand:
        df = df.filter(pl.col("brand") == brand)
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    if period_from:
        df = df.filter(pl.col("date") >= period_from)
    if period_to:
        df = df.filter(pl.col("date") <= period_to)

    n = len(df)
    if n == 0:
        return DEFAULT_PRICE_FALLBACK, 0

    total_revenue = float(df["revenue_gbp"].sum())
    total_hl = float(df["Hl"].sum())
    if total_hl <= 0:
        return DEFAULT_PRICE_FALLBACK, n
    return (total_revenue * REVENUE_SCALE_TO_GBP) / total_hl, n


def price_by_keys(
    keys: list[tuple[str, str]],
) -> dict[tuple[str, str], float | None]:
    """Bulk lookup: SKU × sub_channel pairs → £/hL.

    One scan over `wide_monthly`, grouped by (material_id, sub_channel),
    rather than N round-trips through `gross_price_per_hl`. Used by /api/gap
    so we can attach a £ rate to every row without N queries.
    """
    df = _wide()
    if len(df) == 0 or not keys:
        return {k: DEFAULT_PRICE_FALLBACK for k in keys}

    wanted_skus = {k[0] for k in keys}
    wanted_chs = {k[1] for k in keys}
    df = df.filter(
        pl.col("material_id").is_in(list(wanted_skus))
        & pl.col("sub_channel").is_in(list(wanted_chs))
    )
    if len(df) == 0:
        return {k: DEFAULT_PRICE_FALLBACK for k in keys}

    by = df.group_by(["material_id", "sub_channel"]).agg(
        revenue=pl.col("revenue_gbp").sum(),
        hl=pl.col("Hl").sum(),
    )
    out: dict[tuple[str, str], float | None] = {k: DEFAULT_PRICE_FALLBACK for k in keys}
    for row in by.iter_rows(named=True):
        if row["hl"] > 0:
            rate = (float(row["revenue"]) * REVENUE_SCALE_TO_GBP) / float(row["hl"])
            out[(row["material_id"], row["sub_channel"])] = rate
    return out


def price_by_brand(brands: list[str]) -> dict[str, float | None]:
    """Bulk lookup: brand → £/hL averaged over all SKUs in that brand."""
    df = _wide()
    if len(df) == 0 or not brands:
        return {b: DEFAULT_PRICE_FALLBACK for b in brands}

    df = df.filter(pl.col("brand").is_in(brands))
    by = df.group_by("brand").agg(
        revenue=pl.col("revenue_gbp").sum(),
        hl=pl.col("Hl").sum(),
    )
    out: dict[str, float | None] = {b: DEFAULT_PRICE_FALLBACK for b in brands}
    for row in by.iter_rows(named=True):
        if row["hl"] > 0:
            out[row["brand"]] = (
                float(row["revenue"]) * REVENUE_SCALE_TO_GBP / float(row["hl"])
            )
    return out


def price_by_sub_channel(sub_channels: list[str]) -> dict[str, float | None]:
    """Bulk lookup: sub_channel → £/hL averaged over all SKUs in that channel."""
    df = _wide()
    if len(df) == 0 or not sub_channels:
        return {c: DEFAULT_PRICE_FALLBACK for c in sub_channels}

    df = df.filter(pl.col("sub_channel").is_in(sub_channels))
    by = df.group_by("sub_channel").agg(
        revenue=pl.col("revenue_gbp").sum(),
        hl=pl.col("Hl").sum(),
    )
    out: dict[str, float | None] = {c: DEFAULT_PRICE_FALLBACK for c in sub_channels}
    for row in by.iter_rows(named=True):
        if row["hl"] > 0:
            out[row["sub_channel"]] = (
                float(row["revenue"]) * REVENUE_SCALE_TO_GBP / float(row["hl"])
            )
    return out


def portfolio_price_per_hl() -> float | None:
    """Single UK-wide rate. Used for portfolio-level pulse readouts."""
    rate, _ = gross_price_per_hl()
    return rate
