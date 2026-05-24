"""Post-forecast multiplicative seasonality.

The LightGBM ensemble produces a near-flat line at long horizons because
iterative h-step prediction feeds its own (already-averaged) p50 forward
as the lag for the next step — by h=4+ the lags are all predicted means,
which is exactly the conditional mean.

We've already tried teaching the model the missing shape via features
(event-importance flags, planned-promo counts, etc.); both rolled back
because the model can't learn what isn't varied enough in the training
window. See MODEL.md "Rolled-back experiments".

This module takes the opposite tack: leave the model alone, and inject
the historical monthly pattern as a *post-forecast multiplicative
adjustment*. The same playbook as the one-off World Cup / Euros boost
in services/calendar.py — deterministic, transparent, applied to the
ensemble output in services/forecast/ensemble.py.

Two-tier resolution
-------------------

For each (material_id, sub_channel, month_of_year) we want a multiplier
that says "in this month, this SKU in this channel runs X% above/below
its annual mean". Two reasonable ways to compute this, with a trade-off:

  · Per-SKU (granular): captures SKU-specific peaks like the hero
    Estrella 330ml NRB's October spike (5,149 hL vs 2,500 annual mean
    → 2.06× before bounding). Noisy when a SKU has only one or two
    instances of a given month — that month's value IS its multiplier.

  · Brand-pooled (smoothed): averages across all SKUs of a brand for
    the same channel, giving n=30+ per month for big brands. Stable
    but conservative — Estrella × GROCERY October pooled multiplier
    is only 1.20× because the 660ml and 12x330 SKUs have flatter Oct
    patterns and drag the brand mean down.

We resolve **per-SKU first when 12-month coverage exists**, falling back
to **brand-pooled** for SKUs without enough data. Bounds are looser for
per-SKU since the whole point is to recover SKU-specific peaks the
brand-pooled multiplier washes out.

Math is the same at both tiers:
  multiplier[..., month] = mean(Hl in that month) ÷ mean(Hl across months)
  → bound to [floor, ceiling]
  → renormalise so the 12-month mean is exactly 1.0 post-bound
  → annual level preserved, only intra-year shape changes
"""

from __future__ import annotations

from typing import Literal

import polars as pl

# Per-SKU bounds — wider since we want to recover real SKU spikes that
# the brand-pooled tier washes out (Christmas / summer peaks routinely
# hit 1.8-2.2× the annual mean for individual SKUs).
SKU_BOUNDS: tuple[float, float] = (0.40, 2.20)

# Brand-pooled bounds — tighter since the pooled mean is smoother and
# the upside should already be a measured cross-SKU average. Anything
# beyond 1.8× at brand level is more likely outlier than signal.
BRAND_BOUNDS: tuple[float, float] = (0.55, 1.80)

# Per-month minimum observations before we trust a brand-pooled series.
# Brand-level usually has 5-20 SKUs × multiple years contributing, so 3
# is comfortable. (We don't apply this floor to per-SKU because a SKU
# legitimately has n=1 per month after one year of history — the
# 12-month-coverage requirement does the gatekeeping there.)
BRAND_MIN_OBS_PER_MONTH: int = 3

# Tier marker — appended to keys so callers can introspect which tier
# resolved a given (sku, channel) — useful for debugging the chart's
# shape when something looks off.
SkuKey = tuple[Literal["sku"], str, str, int]   # ("sku", material_id, sub_channel, month)
BrandKey = tuple[Literal["brand"], str, str, int]
MultiplierKey = SkuKey | BrandKey


def compute_seasonality_multipliers(
    monthly: pl.DataFrame,
) -> dict[MultiplierKey, float]:
    """Build a two-tier multiplier lookup.

    Returns keys of the form:
      ("sku",   material_id, sub_channel, month) -> multiplier
      ("brand", brand,       sub_channel, month) -> multiplier

    `apply_seasonality` will prefer the per-SKU key and fall back to the
    brand key. Missing both is interpreted as multiplier 1.0.

    Empty dict when nothing qualifies.
    """
    if monthly.is_empty():
        return {}
    df = monthly.with_columns(month=pl.col("date").dt.month())
    out: dict[MultiplierKey, float] = {}

    # ── Tier 1: per-SKU ─────────────────────────────────────────────────
    by_sku = (
        df.group_by(["material_id", "sub_channel", "month"])
        .agg(mean_hl=pl.col("Hl").mean(), n=pl.len())
    )
    for (sku, sub), grp in by_sku.group_by(["material_id", "sub_channel"]):
        per_month = {r["month"]: r["mean_hl"] for r in grp.iter_rows(named=True)}
        if len(per_month) < 12:
            continue
        all_mean = sum(per_month.values()) / 12
        if all_mean <= 0:
            continue
        bounded = {
            m: max(SKU_BOUNDS[0], min(SKU_BOUNDS[1], val / all_mean))
            for m, val in per_month.items()
        }
        local_mean = sum(bounded.values()) / 12
        if local_mean <= 0:
            continue
        for m, mult in bounded.items():
            out[("sku", sku, sub, m)] = mult / local_mean

    # ── Tier 2: brand-pooled fallback ───────────────────────────────────
    by_brand = (
        df.group_by(["brand", "sub_channel", "month"])
        .agg(mean_hl=pl.col("Hl").mean(), n=pl.len())
    )
    for (brand, sub), grp in by_brand.group_by(["brand", "sub_channel"]):
        per_month = {r["month"]: (r["mean_hl"], r["n"]) for r in grp.iter_rows(named=True)}
        if len(per_month) < 12:
            continue
        if any(n < BRAND_MIN_OBS_PER_MONTH for _, n in per_month.values()):
            continue
        all_mean = sum(v for v, _ in per_month.values()) / 12
        if all_mean <= 0:
            continue
        bounded = {
            m: max(BRAND_BOUNDS[0], min(BRAND_BOUNDS[1], val / all_mean))
            for m, (val, _) in per_month.items()
        }
        local_mean = sum(bounded.values()) / 12
        if local_mean <= 0:
            continue
        for m, mult in bounded.items():
            out[("brand", brand, sub, m)] = mult / local_mean

    return out


def apply_seasonality(
    forecast: pl.DataFrame,
    multipliers: dict[MultiplierKey, float],
) -> pl.DataFrame:
    """Multiply Hl_hat_p10/50/p90 by the per-month multiplier. Per-SKU key
    wins when present; brand-pooled is the fallback; otherwise 1.0.

    Forecast frame must have material_id, brand, sub_channel, date, and
    the three quantile columns.
    """
    if not multipliers:
        return forecast

    def _mult(row: dict) -> float:
        month = row["date"].month
        sku_key: SkuKey = ("sku", row["material_id"], row["sub_channel"], month)
        if sku_key in multipliers:
            return multipliers[sku_key]
        brand_key: BrandKey = ("brand", row["brand"], row["sub_channel"], month)
        return multipliers.get(brand_key, 1.0)

    return (
        forecast.with_columns(
            pl.struct(["material_id", "brand", "sub_channel", "date"])
            .map_elements(_mult, return_dtype=pl.Float64)
            .alias("_seasonal"),
        )
        .with_columns(
            (pl.col("Hl_hat_p10") * pl.col("_seasonal")).alias("Hl_hat_p10"),
            (pl.col("Hl_hat_p50") * pl.col("_seasonal")).alias("Hl_hat_p50"),
            (pl.col("Hl_hat_p90") * pl.col("_seasonal")).alias("Hl_hat_p90"),
        )
        .drop("_seasonal")
    )
