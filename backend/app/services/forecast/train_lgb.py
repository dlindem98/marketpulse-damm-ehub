"""LightGBM quantile ensemble training — production version.

What this does:
  1. Loads wide_monthly.parquet
  2. Builds features (lags + rolling + Fourier + holidays)
  3. Time-based train/val/test split
  4. Target-encodes categoricals on TRAIN ONLY (no leakage)
  5. Fits three quantile LightGBM models (p10/p50/p90) with all Tier-1
     robustness controls enabled (early stopping, L2, bagging, feat_fraction)
  6. Persists models to backend/models/lgb_p{10,50,90}.joblib
  7. Persists per-iteration learning curves to snapshots/learning_curves.parquet
  8. Records overall (not yet per-channel) conformal qhat to calibration.parquet

The per-channel CQR is applied later in `forecast.train` after ensembling.

Run with:  cd backend && PYTHONHASHSEED=42 uv run python -m app.services.forecast.train_lgb
"""

from __future__ import annotations

import time
import warnings

import joblib
import lightgbm as lgb
import numpy as np
import polars as pl
from category_encoders import TargetEncoder

from app.paths import MODELS_DIR as MODELS, SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path
from app.services.forecast.conformal import calibrate
from app.services.forecast.features import build_features, time_split

warnings.filterwarnings("ignore", message="X does not have valid feature names")

WIDE = snapshot_path("wide_monthly.parquet")
MODELS.mkdir(parents=True, exist_ok=True)

QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}


def make_model(alpha: float) -> lgb.LGBMRegressor:
    """LightGBM with all Tier-1 robustness knobs enabled."""
    return lgb.LGBMRegressor(
        objective="quantile", alpha=alpha,
        n_estimators=1500, learning_rate=0.05,
        num_leaves=63, min_data_in_leaf=20,
        reg_lambda=0.1,
        bagging_fraction=0.8, bagging_freq=5,
        feature_fraction=0.8,
        random_state=42,
        verbose=-1,
    )


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def fit_target_encoder(train: pl.DataFrame, cat_cols: list[str]) -> TargetEncoder:
    """TRAIN-ONLY target encoding with smoothing — prevents val/test leakage."""
    te = TargetEncoder(cols=cat_cols, smoothing=10.0)
    te.fit(train.select(cat_cols).to_pandas(), train["Hl"].to_pandas())
    return te


def apply_target_encoder(
    df: pl.DataFrame, cat_cols: list[str], te: TargetEncoder,
) -> pl.DataFrame:
    encoded = te.transform(df.select(cat_cols).to_pandas())
    renamed = {c: f"{c}_te" for c in cat_cols}
    encoded = encoded.rename(columns=renamed)
    return pl.concat([df, pl.from_pandas(encoded)], how="horizontal")


def main() -> int:
    print("=" * 72)
    print("STEP 1 — LightGBM quantile ensemble (production)")
    print("=" * 72)

    if not WIDE.is_file():
        print(f"\n  wide_monthly.parquet not found at {WIDE}")
        print("  Run `make data` first.")
        return 2

    df = pl.read_parquet(WIDE)
    print(f"\n[1/5] loaded wide_monthly.parquet: {len(df):,} rows  "
          f"({df['date'].min()} → {df['date'].max()})")

    df, numeric, categorical = build_features(df)
    df = df.drop_nulls(subset=numeric + ["Hl"])
    print(f"[2/5] feature build complete: {len(numeric)} numeric + "
          f"{len(categorical)} categorical features; {len(df):,} rows after drop_nulls")

    train, val, test = time_split(df, val_weeks=12, test_weeks=12)
    print(f"[3/5] time split: train={len(train):,}  val={len(val):,}  test={len(test):,}")
    print(f"      train window: {train['date'].min()} → {train['date'].max()}")
    print(f"      val window:   {val['date'].min()} → {val['date'].max()}")
    print(f"      test window:  {test['date'].min()} → {test['date'].max()}")

    te = fit_target_encoder(train, categorical)
    train = apply_target_encoder(train, categorical, te)
    val   = apply_target_encoder(val,   categorical, te)
    test  = apply_target_encoder(test,  categorical, te)
    te_cols = [f"{c}_te" for c in categorical]
    features = numeric + te_cols

    Xtr, ytr = train.select(features).to_numpy(), train["Hl"].to_numpy()
    Xva, yva = val.select(features).to_numpy(),   val["Hl"].to_numpy()
    Xte, yte = test.select(features).to_numpy(),  test["Hl"].to_numpy()

    print(f"\n[4/5] fitting 3 quantile models   (features={len(features)})")
    fitted: dict[str, lgb.LGBMRegressor] = {}
    curves: list[dict] = []
    for name, alpha in QUANTILES.items():
        m = make_model(alpha)
        eval_dict: dict = {}
        t0 = time.time()
        m.fit(
            Xtr, ytr,
            eval_set=[(Xtr, ytr), (Xva, yva)],
            eval_names=["train", "val"],
            eval_metric="mape",
            callbacks=[
                lgb.early_stopping(stopping_rounds=50, verbose=False),
                lgb.record_evaluation(eval_dict),
            ],
        )
        bi = m.best_iteration_
        dt = time.time() - t0
        print(f"      {name}: stopped at {bi:>4}/1500   "
              f"train MAPE {eval_dict['train']['mape'][bi-1]:.3f}  "
              f"val MAPE {eval_dict['val']['mape'][bi-1]:.3f}  "
              f"({dt:.1f}s)")
        fitted[name] = m
        for it, (tr, vl) in enumerate(
            zip(eval_dict["train"]["mape"], eval_dict["val"]["mape"]), start=1,
        ):
            curves.append({
                "quantile": name, "iteration": it,
                "train_mape": tr, "val_mape": vl,
                "is_best": it == bi,
            })

    print(f"\n[5/5] persisting artifacts")
    for name, m in fitted.items():
        joblib.dump(m, MODELS / f"lgb_{name}.joblib")
        print(f"      models/lgb_{name}.joblib  (best_iteration={m.best_iteration_})")
    joblib.dump(te, MODELS / "target_encoder.joblib")
    print(f"      models/target_encoder.joblib")
    pl.DataFrame(curves).write_parquet(SNAPSHOTS / "learning_curves.parquet")
    print(f"      snapshots/learning_curves.parquet  ({len(curves):,} rows)")

    # Conformal calibration — overall qhat first (per-channel comes after ensemble)
    p10_val = fitted["p10"].predict(Xva, num_iteration=fitted["p10"].best_iteration_)
    p90_val = fitted["p90"].predict(Xva, num_iteration=fitted["p90"].best_iteration_)
    p10_te  = fitted["p10"].predict(Xte, num_iteration=fitted["p10"].best_iteration_)
    p90_te  = fitted["p90"].predict(Xte, num_iteration=fitted["p90"].best_iteration_)
    report = calibrate(yva, p10_val, p90_val, yte, p10_te, p90_te, target_level=0.8)
    print(f"\n      conformal (overall):  qhat={report.qhat:.2f}   "
          f"raw_cov={report.raw_coverage:.1%}   cal_cov={report.cal_coverage:.1%}")
    pl.DataFrame([{
        "scope": "overall",
        "qhat": report.qhat,
        "target_level": report.target_level,
        "raw_coverage": report.raw_coverage,
        "cal_coverage": report.cal_coverage,
        "raw_width": report.raw_width,
        "cal_width": report.cal_width,
        "n_calibration": report.n_calibration,
    }]).write_parquet(SNAPSHOTS / "calibration.parquet")
    print(f"      snapshots/calibration.parquet")

    # Invariant: best_iteration < cap for every quantile
    for name, m in fitted.items():
        assert m.best_iteration_ < 1500, f"{name} did not early-stop (used all 1500 trees)"

    # Per-quantile feature importances → log top 10 for the demo Q&A
    p50 = fitted["p50"]
    imp = sorted(zip(features, p50.feature_importances_), key=lambda x: -x[1])
    print(f"\n      top-10 features (p50 gain importance):")
    for f, i in imp[:10]:
        print(f"        {f:<24} {i}")

    print("\nSTEP 1 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
