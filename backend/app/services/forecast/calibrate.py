"""Per-channel conformal calibration on the validation set.

Uses CQR (split conformal on the quantile output): score = max(p10-y, y-p90)
on the held-out val window, take the (1-α)-th quantile of scores per channel
to get qhat. Apply qhat at inference time to widen the PI uniformly.

Reads:  snapshots/wide_monthly.parquet  (for val-window actuals + LGB val preds)
        models/lgb_p10.joblib, lgb_p50.joblib, lgb_p90.joblib
Writes: snapshots/calibration.parquet  (one row per sub_channel + 'overall')
        snapshots/forecast.parquet  (adds Hl_hat_p10_cal, Hl_hat_p90_cal)
"""

from __future__ import annotations

import warnings

import joblib
import numpy as np
import polars as pl

from app.paths import MODELS_DIR as MODELS, SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path
from app.services.forecast.conformal import calibrate, per_group_qhats
from app.services.forecast.features import build_features, time_split

warnings.filterwarnings("ignore", message="X does not have valid feature names")

WIDE = snapshot_path("wide_monthly.parquet")
FORECAST = snapshot_path("forecast.parquet")


def main() -> int:
    print("=" * 72)
    print("STEP 7 — Per-channel conformal calibration")
    print("=" * 72)

    monthly = pl.read_parquet(WIDE)
    df, numeric, categorical = build_features(monthly)
    df = df.drop_nulls(subset=numeric + ["Hl"])
    train, val, test = time_split(df, val_weeks=12, test_weeks=12)
    print(f"\n[1/3] val window: {val['date'].min()} → {val['date'].max()}  ({len(val):,} rows)")

    te = joblib.load(MODELS / "target_encoder.joblib")
    val_pd = te.transform(val.select(categorical).to_pandas())
    val_pd = val_pd.rename(columns={c: f"{c}_te" for c in categorical})
    val_enc = pl.concat([val, pl.from_pandas(val_pd)], how="horizontal")
    features = numeric + [f"{c}_te" for c in categorical]

    Xva = val_enc.select(features).to_numpy()
    yva = val_enc["Hl"].to_numpy()
    p10 = joblib.load(MODELS / "lgb_p10.joblib")
    p90 = joblib.load(MODELS / "lgb_p90.joblib")
    p10_val = p10.predict(Xva, num_iteration=p10.best_iteration_)
    p90_val = p90.predict(Xva, num_iteration=p90.best_iteration_)

    sub_channels = val_enc["sub_channel"].to_numpy()
    qhats = per_group_qhats(
        groups_calib=sub_channels,
        y_calib=yva, q_lo_calib=p10_val, q_hi_calib=p90_val,
        target_level=0.8, min_rows=10, pool_label="__default__",
    )
    print(f"\n[2/3] per-channel qhats:")
    for ch, q in qhats.items():
        print(f"        {ch:<28} qhat = {q:>8.2f} Hl")

    # Overall report
    overall = calibrate(yva, p10_val, p90_val, yva, p10_val, p90_val, target_level=0.8)
    print(f"\n      overall (val): qhat={overall.qhat:.2f}  raw_cov={overall.raw_coverage:.1%}  cal_cov={overall.cal_coverage:.1%}")

    print(f"\n[3/3] writing calibration.parquet + updating forecast.parquet")
    rows = [
        {"sub_channel": ch, "qhat": q, "target_level": 0.8}
        for ch, q in qhats.items()
    ]
    pl.DataFrame(rows).write_parquet(SNAPSHOTS / "calibration.parquet")
    print(f"      snapshots/calibration.parquet")

    # Apply per-channel qhat to the production forecast
    fc = pl.read_parquet(FORECAST)
    qhat_lookup = {ch: q for ch, q in qhats.items()}
    default_q = qhats.get("__default__", overall.qhat)
    fc = fc.with_columns(
        qhat=pl.col("sub_channel").map_elements(
            lambda c: qhat_lookup.get(c, default_q),
            return_dtype=pl.Float64,
        ),
    ).with_columns(
        Hl_hat_p10_cal=(pl.col("Hl_hat_p10") - pl.col("qhat")).clip(lower_bound=0.0),
        Hl_hat_p90_cal=(pl.col("Hl_hat_p90") + pl.col("qhat")),
    )
    fc.write_parquet(FORECAST)
    print(f"      forecast.parquet now has Hl_hat_p10_cal + Hl_hat_p90_cal columns")
    print(f"      avg PI width raw → cal: "
          f"{(fc['Hl_hat_p90'] - fc['Hl_hat_p10']).mean():.1f}  →  "
          f"{(fc['Hl_hat_p90_cal'] - fc['Hl_hat_p10_cal']).mean():.1f}")
    print("\nSTEP 7 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
