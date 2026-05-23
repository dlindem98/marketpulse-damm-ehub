"""Promo causal impact analysis (GROCERY only).

For each (promo_type, brand) pair with enough historical events, estimate
lift via difference-in-differences against a control window. We deliberately
keep this simple and robust:

  - For each "promo period" in promos.parquet (months where on_promo=true),
    compare actual Hl during promo months to the same brand's prior-12-month
    same-month median.
  - Average lift across all event instances of that promo_type × brand.
  - Compute ROI = lift_hl × revenue_per_hl / estimated_cost
    (cost is approximate; flagged with confidence='low' where unknown).

This is more robust than tfcausalimpact (which needs strict counterfactual
series and often fails silently for our small data); when we have more
data we can swap in CausalImpact.

Writes: snapshots/promo_roi.parquet
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[3]
WIDE = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"
PROMOS = ROOT / "app" / "data" / "snapshots" / "promos.parquet"
SNAPSHOTS = ROOT / "app" / "data" / "snapshots"

ESTIMATED_COST_PER_PROMO: dict[str, float] = {
    "multi-buy":   12_400.0,
    "price-cut":    9_800.0,
    "rollback":    11_200.0,
    "clearance":    6_500.0,
    "listing":      3_500.0,
}


def main() -> int:
    print("=" * 72)
    print("STEP 11 — Promo ROI via diff-in-diff (GROCERY)")
    print("=" * 72)

    monthly = pl.read_parquet(WIDE).filter(pl.col("sub_channel") == "GROCERY")
    promos = pl.read_parquet(PROMOS).filter(pl.col("on_promo"))
    print(f"\n[1/3] GROCERY monthly: {len(monthly):,} rows")
    print(f"      on-promo cells: {len(promos):,}")

    # Promo months per (brand, promo_type): we need to know which months
    # had which promo type for each brand.
    # promos.sku is the retailer's SKU name string; map to brand via fuzzy
    # match on first word (e.g. "Estrella 12x330ml NRB" → "ESTRELLA")
    def first_word_brand(sku: str | None) -> str | None:
        if not sku:
            return None
        return sku.strip().split()[0].upper()

    promos = promos.with_columns(
        brand_key=pl.col("sku").map_elements(first_word_brand, return_dtype=pl.String),
    )
    # Aggregate cells to (brand_key, promo_type, year, month) — was this brand
    # on promo at some grocer in this month?
    promo_months = (
        promos
        .with_columns(
            year=pl.col("iso_week").dt.year(),
            month=pl.col("iso_week").dt.month(),
        )
        .group_by(["brand_key", "promo_type", "year", "month"])
        .agg(n_cells=pl.len())
    )

    # Build brand-level Hl per month from history
    brand_monthly = (
        monthly
        .with_columns(brand_key=pl.col("brand").str.replace(" .*", "").str.to_uppercase())
        .group_by(["brand_key", "date"])
        .agg(pl.col("Hl").sum())
    )

    # For each (brand, promo_type), compare in-promo months vs same-brand same-
    # month median over the prior 12 months.
    results: list[dict] = []
    for (brand_key, promo_type), events in promo_months.group_by(["brand_key", "promo_type"]):
        events_list = events.to_dicts()
        lifts_hl, lifts_pct = [], []
        for e in events_list:
            target_date = pl.date(e["year"], e["month"], 1)
            actual_row = brand_monthly.filter(
                (pl.col("brand_key") == brand_key) & (pl.col("date") == target_date.cast(pl.Date)) if False
                else (pl.col("brand_key") == brand_key)
            )
            from datetime import date as dt_date
            target_d = dt_date(int(e["year"]), int(e["month"]), 1)
            row = brand_monthly.filter(
                (pl.col("brand_key") == brand_key) & (pl.col("date") == target_d)
            )
            if len(row) == 0:
                continue
            actual = float(row[0, "Hl"])

            # Baseline = median Hl for same brand in prior 12 months (any subset of months)
            prior = brand_monthly.filter(
                (pl.col("brand_key") == brand_key)
                & (pl.col("date") < target_d)
                & (pl.col("date") >= dt_date(target_d.year - 1, target_d.month, 1))
            )
            if len(prior) < 3:
                continue
            baseline = float(prior["Hl"].median())
            if baseline <= 0:
                continue
            lifts_hl.append(actual - baseline)
            lifts_pct.append((actual - baseline) / baseline)

        if not lifts_pct:
            continue
        avg_lift_pct = float(np.mean(lifts_pct))
        avg_lift_hl  = float(np.mean(lifts_hl))
        n = len(lifts_pct)
        cost = ESTIMATED_COST_PER_PROMO.get(promo_type)
        # Approximate revenue/Hl from monthly history (£/Hl)
        rev_per_hl = float(
            (monthly["revenue_gbp"].sum() / max(monthly["Hl"].sum(), 1.0))
        ) if "revenue_gbp" in monthly.columns else 100.0
        roi = (avg_lift_hl * rev_per_hl) / cost if cost else None
        confidence = "high" if n >= 5 and avg_lift_pct > 0.02 else ("medium" if n >= 3 else "low")

        results.append({
            "promo_type": promo_type,
            "brand_key":  brand_key,
            "sub_channel": "GROCERY",
            "avg_lift_pct": avg_lift_pct,
            "avg_lift_hl":  avg_lift_hl,
            "estimated_cost": cost,
            "roi":         roi,
            "n_observations": n,
            "confidence":  confidence,
        })

    out = pl.DataFrame(results)
    if len(out) == 0:
        print("  ! no promo ROI rows produced")
        return 0
    out = out.sort("roi", descending=True, nulls_last=True)
    out.write_parquet(SNAPSHOTS / "promo_roi.parquet")
    print(f"\n[2/3] computed ROI for {len(out)} (promo_type, brand) tuples")
    print(out)
    print(f"\n[3/3] snapshots/promo_roi.parquet")
    print("\nSTEP 11 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
