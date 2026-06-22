"""Rolling-origin cross-validation — produces MAPE table for the dashboard.

3 folds × 3-month horizon, walk-forward. Each fold fits LGB on data through
month T, predicts T+1..T+3, then T advances 1 month. Out-of-fold predictions
are aggregated into snapshots/mape.parquet keyed by (brand, sub_channel, model).

Reads:  snapshots/wide_monthly.parquet
Writes: snapshots/mape.parquet
"""

from __future__ import annotations

import warnings

import lightgbm as lgb
import numpy as np
import polars as pl
from category_encoders import TargetEncoder

from app.paths import SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path
from app.services.forecast.features import build_features

warnings.filterwarnings("ignore", message="X does not have valid feature names")

WIDE = snapshot_path("wide_monthly.parquet")
N_FOLDS = 3
HORIZON = 3


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def main() -> int:
    print("=" * 72)
    print(f"STEP 8 — Rolling-origin CV ({N_FOLDS} folds × {HORIZON}-month horizon)")
    print("=" * 72)

    monthly = pl.read_parquet(WIDE)
    df, numeric, categorical = build_features(monthly)
    df = df.drop_nulls(subset=numeric + ["Hl"])

    sorted_dates = sorted(df["date"].unique().to_list())
    # Fold cutoffs walk forward: train on data ≤ cutoff, eval on cutoff+1..cutoff+H
    last_d = sorted_dates[-1]
    cutoffs = sorted_dates[-(N_FOLDS + HORIZON):-HORIZON]
    print(f"\n[1/3] fold cutoffs: {cutoffs}")
    print(f"      production end date: {last_d}")

    oof_rows: list[dict] = []
    for fi, cutoff in enumerate(cutoffs, 1):
        train_fold = df.filter(pl.col("date") <= cutoff)
        # Eval on the next HORIZON months that exist in the data
        eval_dates = [d for d in sorted_dates if d > cutoff][:HORIZON]
        eval_fold = df.filter(pl.col("date").is_in(eval_dates))
        if len(eval_fold) == 0:
            continue

        te = TargetEncoder(cols=categorical, smoothing=10.0)
        te.fit(train_fold.select(categorical).to_pandas(), train_fold["Hl"].to_pandas())
        for split_df_var in ("train_fold", "eval_fold"):
            pass

        def apply_te(d: pl.DataFrame) -> pl.DataFrame:
            enc = te.transform(d.select(categorical).to_pandas())
            enc = enc.rename(columns={c: f"{c}_te" for c in categorical})
            return pl.concat([d, pl.from_pandas(enc)], how="horizontal")

        train_enc = apply_te(train_fold)
        eval_enc  = apply_te(eval_fold)
        features = numeric + [f"{c}_te" for c in categorical]
        Xtr, ytr = train_enc.select(features).to_numpy(), train_enc["Hl"].to_numpy()
        Xev, yev = eval_enc.select(features).to_numpy(),  eval_enc["Hl"].to_numpy()

        m = lgb.LGBMRegressor(
            objective="quantile", alpha=0.5,
            n_estimators=600, learning_rate=0.05,
            num_leaves=63, min_data_in_leaf=20,
            reg_lambda=0.1,
            bagging_fraction=0.8, bagging_freq=5,
            feature_fraction=0.8,
            random_state=42, verbose=-1,
        )
        m.fit(Xtr, ytr)
        yhat = m.predict(Xev)

        for row_i, p in enumerate(yhat):
            r = eval_enc.row(row_i, named=True)
            oof_rows.append({
                "fold": fi,
                "cutoff": cutoff,
                "material_id": r["material_id"],
                "brand": r["brand"],
                "sub_channel": r["sub_channel"],
                "date": r["date"],
                "y": float(r["Hl"]),
                "yhat_lgb": float(p),
            })
        fold_mape = mape(yev, yhat)
        print(f"      fold {fi}: train ≤ {cutoff}  eval ({len(eval_fold)} rows)  "
              f"MAPE = {fold_mape:.3f}")

    oof = pl.DataFrame(oof_rows)
    print(f"\n[2/3] {len(oof):,} out-of-fold predictions collected")

    # Aggregate to MAPE per (model, level)
    mape_levels = []
    for level_cols, level_name in [
        (["brand", "sub_channel"], "brand × sub_channel"),
        (["material_id", "sub_channel"], "SKU × sub_channel"),
    ]:
        agg = (
            oof.group_by(level_cols + ["fold"])
            .agg(
                pl.col("y").sum(),
                pl.col("yhat_lgb").sum(),
            )
            .with_columns(
                abs_pct=(pl.col("y") - pl.col("yhat_lgb")).abs() / pl.col("y").clip(lower_bound=1),
            )
        )
        avg = float(agg["abs_pct"].mean())
        mape_levels.append({"level": level_name, "model": "LightGBM ensemble (ours)", "mape": avg, "n_folds": N_FOLDS})
        print(f"      {level_name:<22}  MAPE = {avg:.3f}")

    # Coverage at PI level — load production p10/p90 and compare against actuals
    # (this is an approximation since OOF only has p50 from above)
    coverage_rows = []
    # Just persist MAPE for now; coverage is in calibration.parquet
    pl.DataFrame(mape_levels).write_parquet(SNAPSHOTS / "mape.parquet")
    print(f"\n[3/3] snapshots/mape.parquet ({len(mape_levels)} rows)")
    print("\nSTEP 8 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
