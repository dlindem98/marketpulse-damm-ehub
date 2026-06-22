"""AutoARIMA baseline at Brand × SubChannel grain.

Why we have this: sanity-check the global LightGBM. AutoARIMA fits a
per-series classical model (no covariates). If LGB at the same aggregated
grain is dramatically worse, something's wrong with LGB. If LGB wins,
we know the global pooling is paying off.

The model output is written to snapshots/forecasts_autoarima.parquet
and used later as one component of the ensemble (STEP 5).

Run with:  cd backend && uv run python -m app.services.forecast.autoarima
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd
import polars as pl
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, AutoETS

from app.paths import SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path

WIDE = snapshot_path("wide_monthly.parquet")

HORIZON = 9            # Apr 2026 → Dec 2026 = 9 months
TEST_WEEKS = 12        # mirror the LGB test split


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def aggregate_to_brand_subch(monthly: pl.DataFrame) -> pd.DataFrame:
    """StatsForecast expects pandas with columns: unique_id, ds, y."""
    agg = (
        monthly
        .group_by(["brand", "sub_channel", "date"])
        .agg(pl.col("Hl").sum())
        .with_columns(unique_id=pl.col("brand") + "|" + pl.col("sub_channel"))
        .select(
            pl.col("unique_id"),
            pl.col("date").alias("ds"),
            pl.col("Hl").alias("y"),
        )
        .sort(["unique_id", "ds"])
    )
    return agg.to_pandas()


def main() -> int:
    print("=" * 72)
    print("STEP 2 — AutoARIMA baseline at Brand × SubChannel")
    print("=" * 72)
    if not WIDE.is_file():
        print(f"\n  wide_monthly.parquet not found. Run `make data`.")
        return 2

    monthly = pl.read_parquet(WIDE)
    df = aggregate_to_brand_subch(monthly)
    print(f"\n[1/4] aggregated to {df['unique_id'].nunique()} (brand, sub_channel) series")

    # Time-based hold-out — last TEST_WEEKS as test, the rest as train
    last_date = df["ds"].max()
    test_start = last_date - pd.Timedelta(weeks=TEST_WEEKS)
    train = df[df["ds"] < test_start]
    test  = df[df["ds"] >= test_start]
    print(f"[2/4] train rows: {len(train):,}   test rows: {len(test):,}")
    print(f"      train: {train['ds'].min().date()} → {train['ds'].max().date()}")
    print(f"      test:  {test['ds'].min().date()} → {test['ds'].max().date()}")

    # Drop series with <24 months of training — too short for AutoARIMA
    counts = train.groupby("unique_id").size()
    keep = counts[counts >= 24].index
    train = train[train["unique_id"].isin(keep)]
    test  = test[test["unique_id"].isin(keep)]
    print(f"[3/4] keeping {len(keep)} series with ≥24 months training history "
          f"(dropped {len(counts) - len(keep)} short-history series)")

    sf = StatsForecast(
        models=[AutoARIMA(season_length=12), AutoETS(season_length=12)],
        freq="MS",
        n_jobs=-1,
    )
    t0 = time.time()
    sf.fit(train)
    fit_dt = time.time() - t0
    print(f"      fit time: {fit_dt:.1f}s")

    # Predict the test window
    test_horizon = test["ds"].nunique()
    fcst = sf.predict(h=test_horizon, level=[80])
    fcst_eval = test.merge(fcst, on=["unique_id", "ds"], how="inner")
    if len(fcst_eval) == 0:
        print("  ! no overlap between forecast and test — something is wrong")
        return 1

    print(f"[4/4] test horizon: {test_horizon} months, "
          f"{len(fcst_eval):,} (series × month) predictions")

    # MAPE per model
    for col in ("AutoARIMA", "AutoETS"):
        if col not in fcst_eval.columns:
            continue
        m = mape(fcst_eval["y"].to_numpy(), fcst_eval[col].to_numpy())
        print(f"      {col:<10} brand×subchannel test MAPE: {m:.3f}")

    # Now produce production forecasts for the next HORIZON months
    sf_full = StatsForecast(
        models=[AutoARIMA(season_length=12), AutoETS(season_length=12)],
        freq="MS",
        n_jobs=-1,
    )
    sf_full.fit(df[df["unique_id"].isin(keep)])
    prod = sf_full.predict(h=HORIZON, level=[80])
    # Split unique_id back to brand + sub_channel
    prod[["brand", "sub_channel"]] = prod["unique_id"].str.split("|", n=1, expand=True)
    prod = prod.rename(columns={"ds": "date", "AutoARIMA": "Hl_hat_autoarima",
                                "AutoARIMA-lo-80": "lo80_autoarima",
                                "AutoARIMA-hi-80": "hi80_autoarima"})

    out = pl.from_pandas(prod[[
        "brand", "sub_channel", "date", "Hl_hat_autoarima",
        "lo80_autoarima", "hi80_autoarima",
    ]])
    out.write_parquet(SNAPSHOTS / "forecasts_autoarima.parquet")
    print(f"      wrote snapshots/forecasts_autoarima.parquet ({len(out):,} rows)")
    print(f"      production horizon: next {HORIZON} months from training end")

    print("\nSTEP 2 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
