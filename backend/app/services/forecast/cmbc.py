"""CMBC carve-out — separate model for the B2B-distributor sub-channel.

Why this exists: FREE TRADE CMBC is ~40% of UK volume but is a B2B
replenishment relationship, not retail demand. Mixing it into the global
LightGBM dilutes both signals (retail SKUs and B2B SKUs end up sharing
features in the same trees).

This module:
  1. Identifies the CMBC sub-channel rows in wide_monthly.parquet
  2. Computes a CMBC-only forecast using a robust SES + seasonal-naive
     average — appropriate for replenishment patterns (smoother than
     retail demand, no promo signal)
  3. Asserts the invariant that (cmbc + non_cmbc).sum == total.sum
     within 0.001 Hl on the historical aggregate

This produces an alternative forecast for CMBC series only; the ensemble
step (STEP 5) uses it as the dominant signal for CMBC and gives the
global LGB zero weight there.

Run with:  cd backend && uv run python -m app.services.forecast.cmbc
"""

from __future__ import annotations

from datetime import date as date_t

import numpy as np
import pandas as pd
import polars as pl
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, SeasonalNaive

from app.paths import SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path

WIDE = snapshot_path("wide_monthly.parquet")

CMBC_CHANNEL = "FREE TRADE CMBC"
HORIZON = 9


def main() -> int:
    print("=" * 72)
    print("STEP 4 — CMBC carve-out (separate model for B2B replenishment)")
    print("=" * 72)

    if not WIDE.is_file():
        print(f"\n  wide_monthly.parquet not found. Run `make data`.")
        return 2

    monthly = pl.read_parquet(WIDE)
    cmbc = monthly.filter(pl.col("sub_channel") == CMBC_CHANNEL)
    non_cmbc = monthly.filter(pl.col("sub_channel") != CMBC_CHANNEL)
    print(f"\n[1/4] CMBC rows: {len(cmbc):,}   non-CMBC rows: {len(non_cmbc):,}")
    print(f"      CMBC Hl total:     {cmbc['Hl'].sum():>12,.0f}")
    print(f"      non-CMBC Hl total: {non_cmbc['Hl'].sum():>12,.0f}")
    print(f"      combined total:    {(cmbc['Hl'].sum() + non_cmbc['Hl'].sum()):>12,.0f}")
    print(f"      monthly total:     {monthly['Hl'].sum():>12,.0f}")

    # Invariant 1: cmbc + non_cmbc = total (no overlap)
    diff = abs((cmbc["Hl"].sum() + non_cmbc["Hl"].sum()) - monthly["Hl"].sum())
    assert diff < 0.001, f"CMBC + non-CMBC != total — got diff {diff}"
    print(f"      invariant ✓  diff = {diff:.6f} Hl")

    # Forecast CMBC at SKU level (it's the dominant series so per-SKU is fine).
    # AutoARIMA + SeasonalNaive average — robust for replenishment patterns
    # which don't have rich exogenous signal.
    print(f"\n[2/4] forecasting CMBC SKUs with AutoARIMA + SeasonalNaive")
    cmbc_pd = (
        cmbc.with_columns(unique_id=pl.col("material_id") + "|" + pl.col("sub_channel"))
        .select(
            pl.col("unique_id"),
            pl.col("date").alias("ds"),
            pl.col("Hl").alias("y"),
        )
        .sort(["unique_id", "ds"])
        .to_pandas()
    )

    # Drop series with <6 months — too sparse for AutoARIMA
    counts = cmbc_pd.groupby("unique_id").size()
    keep = counts[counts >= 6].index
    cmbc_pd = cmbc_pd[cmbc_pd["unique_id"].isin(keep)]
    print(f"      keeping {len(keep)} series with ≥6 months ({len(counts) - len(keep)} dropped)")

    sf = StatsForecast(
        models=[AutoARIMA(season_length=12), SeasonalNaive(season_length=12)],
        freq="MS",
        n_jobs=-1,
    )
    sf.fit(cmbc_pd)
    fcst = sf.predict(h=HORIZON, level=[80])
    fcst[["material_id", "sub_channel"]] = fcst["unique_id"].str.split("|", n=1, expand=True)
    fcst = fcst.rename(columns={"ds": "date"})

    # Average AutoARIMA + SeasonalNaive (both unbiased, smoother together)
    fcst["Hl_hat_cmbc"]   = (fcst["AutoARIMA"]      + fcst["SeasonalNaive"]) / 2
    fcst["lo80_cmbc"]     = (fcst["AutoARIMA-lo-80"] + fcst["SeasonalNaive-lo-80"]) / 2
    fcst["hi80_cmbc"]     = (fcst["AutoARIMA-hi-80"] + fcst["SeasonalNaive-hi-80"]) / 2

    out = pl.from_pandas(fcst[[
        "material_id", "sub_channel", "date",
        "Hl_hat_cmbc", "lo80_cmbc", "hi80_cmbc",
    ]])
    out = out.with_columns(pl.col("date").cast(pl.Date))
    out.write_parquet(SNAPSHOTS / "forecasts_cmbc.parquet")
    print(f"\n[3/4] wrote snapshots/forecasts_cmbc.parquet  ({len(out):,} rows = "
          f"{len(keep)} SKUs × {HORIZON} months)")

    # Invariant 2: forecast values are finite, positive (where expected)
    assert out["Hl_hat_cmbc"].is_finite().all(), "CMBC forecast has non-finite values"
    n_negative = (out["Hl_hat_cmbc"] < 0).sum()
    print(f"\n[4/4] sanity: {n_negative} rows with negative point forecast")
    if n_negative > 0:
        print("      (clipping negatives to 0 for downstream use)")
        out = out.with_columns(pl.col("Hl_hat_cmbc").clip(lower_bound=0))
        out.write_parquet(SNAPSHOTS / "forecasts_cmbc.parquet")

    print("\nSTEP 4 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
