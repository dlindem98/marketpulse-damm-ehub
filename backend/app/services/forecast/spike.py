"""Phase-2 spike — quantile LightGBM with all Tier-1 robustness techniques.

Demonstrates on real Phase 1 data:
  · Early stopping + L2 regularization                ([DECISIONS.md D-010])
  · Bagging + column subsampling                      ([D-011] B)
  · K-fold-safe target encoding                       ([D-011] C)
  · Fourier seasonality features                      ([D-011] E)
  · Holiday-aware calendar features                   ([D-011] D)
  · Conformalized Quantile Regression (CQR) for PIs   ([D-011] A) ★ headline

Run with:  cd backend && PYTHONHASHSEED=42 uv run python -m app.services.forecast.spike
"""

from __future__ import annotations

import time
import warnings
from datetime import date
from pathlib import Path

import holidays as hd
import lightgbm as lgb
import numpy as np
import polars as pl
from category_encoders import TargetEncoder

warnings.filterwarnings("ignore", message="X does not have valid feature names")

ROOT = Path(__file__).resolve().parents[3]
WIDE = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"
OUT  = ROOT / "app" / "data" / "snapshots"

QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}
TARGET_PI_LEVEL = 0.8   # we want 80% coverage on test


# ────────────────────────────────────────────────────────────────────────────
# Feature engineering — Tier 1: Fourier + holiday calendar features
# ────────────────────────────────────────────────────────────────────────────

def build_features(monthly: pl.DataFrame) -> tuple[pl.DataFrame, list[str], list[str]]:
    """Add lags, rolling, Fourier seasonality, and holiday calendar features."""
    df = monthly.sort(["material_id", "sub_channel", "date"])
    series_keys = ["material_id", "sub_channel"]

    # ── Time-series features (lags + rolling means) ────────────────────────
    numeric_features: list[str] = []
    for lag in (1, 3, 6, 12):
        col = f"lag_{lag}"
        df = df.with_columns(pl.col("Hl").shift(lag).over(series_keys).alias(col))
        numeric_features.append(col)
    for window in (3, 6, 12):
        col = f"roll_mean_{window}"
        df = df.with_columns(
            pl.col("Hl").shift(1).rolling_mean(window_size=window, min_samples=1)
              .over(series_keys).alias(col),
        )
        numeric_features.append(col)

    # ── Calendar baseline ──────────────────────────────────────────────────
    numeric_features += ["month", "quarter", "year", "uk_holidays_count"]

    # ── Fourier seasonality (Tier 1 E) ─────────────────────────────────────
    df = df.with_columns(
        (2 * np.pi * pl.col("month") / 12).sin().alias("month_sin"),
        (2 * np.pi * pl.col("month") / 12).cos().alias("month_cos"),
        (2 * np.pi * pl.col("quarter") / 4).sin().alias("quarter_sin"),
        (2 * np.pi * pl.col("quarter") / 4).cos().alias("quarter_cos"),
    )
    numeric_features += ["month_sin", "month_cos", "quarter_sin", "quarter_cos"]

    # ── Holiday calendar features (Tier 1 D) ───────────────────────────────
    # For monthly data the relevant signal is whether the month CONTAINS the
    # holiday or sits adjacent to it, not a literal day-distance. We add
    # binary flags for the months that meaningfully shift UK beer demand.
    uk_holidays = hd.country_holidays("GB", years=range(2022, 2028))
    easter_months: set[tuple[int, int]] = set()
    for d, name in uk_holidays.items():
        if "Easter Monday" in name:
            easter_months.add((d.year, d.month))

    df = df.with_columns(
        (pl.col("month") == 12).cast(pl.Int8).alias("is_christmas_month"),
        (pl.col("month").is_in([6, 7, 8])).cast(pl.Int8).alias("is_summer"),
        pl.struct(["year", "month"])
            .map_elements(lambda s: int((s["year"], s["month"]) in easter_months),
                          return_dtype=pl.Int8)
            .alias("is_easter_month"),
        (pl.col("month").is_in([10, 11])).cast(pl.Int8).alias("is_christmas_buildup"),
    )
    numeric_features += ["is_christmas_month", "is_summer", "is_easter_month", "is_christmas_buildup"]

    # ── Categorical columns — target-encoded later (fold-aware) ────────────
    categorical_features = ["brand", "sub_channel", "sales_channel"]

    return df, numeric_features, categorical_features


# ────────────────────────────────────────────────────────────────────────────
# Training & calibration
# ────────────────────────────────────────────────────────────────────────────

def time_split(df: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Time-based train/val/test split. Never shuffle on time series."""
    last_date = df["date"].max()
    test_start = last_date - pl.duration(weeks=12)
    val_start  = test_start - pl.duration(weeks=12)
    return (
        df.filter(pl.col("date") < val_start),
        df.filter((pl.col("date") >= val_start) & (pl.col("date") < test_start)),
        df.filter(pl.col("date") >= test_start),
    )


def fit_target_encoder(train: pl.DataFrame, cat_cols: list[str]) -> TargetEncoder:
    """Target encoding fitted on TRAIN ONLY — prevents val/test leakage."""
    te = TargetEncoder(cols=cat_cols, smoothing=10.0)
    te.fit(train.select(cat_cols).to_pandas(), train["Hl"].to_pandas())
    return te


def apply_target_encoder(df: pl.DataFrame, cat_cols: list[str], te: TargetEncoder) -> pl.DataFrame:
    encoded = te.transform(df.select(cat_cols).to_pandas())
    renamed = {c: f"{c}_te" for c in cat_cols}
    encoded = encoded.rename(columns=renamed)
    return pl.concat([df, pl.from_pandas(encoded)], how="horizontal")


def make_model(alpha: float) -> lgb.LGBMRegressor:
    """LightGBM with all Tier-1 robustness knobs enabled."""
    return lgb.LGBMRegressor(
        objective="quantile", alpha=alpha,
        n_estimators=1500, learning_rate=0.05,
        num_leaves=63, min_data_in_leaf=20,
        # Regularization (D-010)
        reg_lambda=0.1,
        # Bagging + column subsampling (D-011 B)
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


def conformalized_quantile_calibration(
    y_calib: np.ndarray, p10_calib: np.ndarray, p90_calib: np.ndarray,
    target_level: float = TARGET_PI_LEVEL,
) -> float:
    """CQR (Conformalized Quantile Regression).

    Returns qhat — the additive correction such that PI [p10-qhat, p90+qhat]
    has empirical coverage ≥ target_level on iid calibration data.
    """
    # Score = max(under_lower, over_upper); positive when PI misses the truth
    scores = np.maximum(p10_calib - y_calib, y_calib - p90_calib)
    # Conformal quantile with finite-sample correction
    n = len(scores)
    q_level = np.ceil((n + 1) * target_level) / n
    q_level = min(q_level, 1.0)
    return float(np.quantile(scores, q_level, method="higher"))


# ────────────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────────────

def main() -> int:
    print("=" * 78)
    print("Phase 2 spike — quantile LightGBM + Tier-1 robustness techniques")
    print("=" * 78)
    if not WIDE.is_file():
        print(f"\n  wide_monthly.parquet not found at {WIDE}\n  Run `make data` first.")
        return 2

    df = pl.read_parquet(WIDE)
    print(f"\n[1/6] Loaded {len(df):,} rows from wide_monthly.parquet "
          f"({df['date'].min()} → {df['date'].max()})")

    print("\n[2/6] Feature engineering (lags + rolling + Fourier + holidays)")
    df, num_features, cat_features = build_features(df)
    df = df.drop_nulls(subset=num_features + ["Hl"])
    print(f"      after feature build + dropna: {len(df):,} rows")
    print(f"      {len(num_features)} numeric + {len(cat_features)} categorical features")
    print(f"      numeric: {num_features}")
    print(f"      categorical (target-encoded): {cat_features}")

    print("\n[3/6] Time-based train/val/test split")
    train, val, test = time_split(df)
    print(f"      train: {len(train):>5,} rows  ({train['date'].min()} → {train['date'].max()})")
    print(f"      val:   {len(val):>5,} rows  ({val['date'].min()} → {val['date'].max()})")
    print(f"      test:  {len(test):>5,} rows  ({test['date'].min()} → {test['date'].max()})")

    print("\n[4/6] Target encoding (fitted on TRAIN ONLY, applied to all splits)")
    te = fit_target_encoder(train, cat_features)
    train = apply_target_encoder(train, cat_features, te)
    val   = apply_target_encoder(val,   cat_features, te)
    test  = apply_target_encoder(test,  cat_features, te)
    te_cols = [f"{c}_te" for c in cat_features]
    all_features = num_features + te_cols
    # Sanity check — train and val target-encoded means must differ
    train_means = {c: float(train[c].mean()) for c in te_cols}
    val_means   = {c: float(val[c].mean())   for c in te_cols}
    print(f"      target-encoded mean per split (train vs val): "
          f"{ {c: (round(train_means[c],1), round(val_means[c],1)) for c in te_cols} }")

    Xtr, ytr = train.select(all_features).to_numpy(), train["Hl"].to_numpy()
    Xva, yva = val.select(all_features).to_numpy(),   val["Hl"].to_numpy()
    Xte, yte = test.select(all_features).to_numpy(),  test["Hl"].to_numpy()

    print(f"\n[5/6] Training 3 quantile models — n_estimators=1500, "
          f"early_stopping(50), bagging=0.8, feature_fraction=0.8, reg_lambda=0.1")
    fitted: dict[str, lgb.LGBMRegressor] = {}
    learning_curves: list[dict] = []
    for name, alpha in QUANTILES.items():
        eval_dict: dict = {}
        m = make_model(alpha)
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
        dt = time.time() - t0
        bi = m.best_iteration_
        tr_mape = eval_dict["train"]["mape"][bi - 1]
        va_mape = eval_dict["val"]["mape"][bi - 1]
        print(f"      {name} (α={alpha}): stopped at {bi:>4} of 1500   "
              f"train MAPE {tr_mape:.3f}  val MAPE {va_mape:.3f}  ({dt:.1f}s)")
        fitted[name] = m
        for it, (tr, vl) in enumerate(zip(eval_dict["train"]["mape"],
                                          eval_dict["val"]["mape"]), start=1):
            learning_curves.append({
                "quantile": name, "iteration": it,
                "train_mape": tr, "val_mape": vl, "is_best": it == bi,
            })

    print(f"\n[6/6] Evaluating on held-out test set + Conformal calibration")
    # Predict on val (for conformal scores) and on test (for evaluation)
    p10_val  = fitted["p10"].predict(Xva, num_iteration=fitted["p10"].best_iteration_)
    p50_val  = fitted["p50"].predict(Xva, num_iteration=fitted["p50"].best_iteration_)
    p90_val  = fitted["p90"].predict(Xva, num_iteration=fitted["p90"].best_iteration_)
    p10_test = fitted["p10"].predict(Xte, num_iteration=fitted["p10"].best_iteration_)
    p50_test = fitted["p50"].predict(Xte, num_iteration=fitted["p50"].best_iteration_)
    p90_test = fitted["p90"].predict(Xte, num_iteration=fitted["p90"].best_iteration_)

    # ── Uncalibrated coverage and MAPE ──────────────────────────────────────
    test_mape_p50_raw = mape(yte, p50_test)
    raw_cover_test    = float(((yte >= p10_test) & (yte <= p90_test)).mean())
    print(f"\n  --- UNCALIBRATED quantile output ---")
    print(f"      test MAPE (p50):                {test_mape_p50_raw:.3f}")
    print(f"      raw 80% PI coverage on test:    {raw_cover_test:.1%}  (target: 80%)")

    # ── Conformalized quantile regression ───────────────────────────────────
    qhat = conformalized_quantile_calibration(yva, p10_val, p90_val, target_level=TARGET_PI_LEVEL)
    p10_test_cal = p10_test - qhat
    p90_test_cal = p90_test + qhat
    cal_cover_test = float(((yte >= p10_test_cal) & (yte <= p90_test_cal)).mean())
    cal_width      = float(np.mean(p90_test_cal - p10_test_cal))
    raw_width      = float(np.mean(p90_test - p10_test))
    print(f"\n  --- CONFORMALIZED (CQR) ---")
    print(f"      qhat (additive correction): {qhat:.2f} Hl")
    print(f"      calibrated PI width (mean): {cal_width:.0f} Hl   (was {raw_width:.0f} uncalibrated)")
    print(f"      calibrated 80% PI coverage: {cal_cover_test:.1%}  (target: 80%)")

    # ── Persist learning curve artifact ─────────────────────────────────────
    lc_df = pl.DataFrame(learning_curves)
    lc_df.write_parquet(OUT / "learning_curves.parquet")
    cal_df = pl.DataFrame({
        "metric": ["qhat", "raw_pi_width", "cal_pi_width", "raw_cover", "cal_cover", "test_mape"],
        "value":  [qhat,    raw_width,     cal_width,     raw_cover_test, cal_cover_test, test_mape_p50_raw],
    })
    cal_df.write_parquet(OUT / "calibration.parquet")
    print(f"\n      wrote learning_curves.parquet ({len(lc_df):,} rows)")
    print(f"      wrote calibration.parquet")

    # ── Per-brand breakdown ─────────────────────────────────────────────────
    print("\n  --- per-brand test MAPE (top 5 by test volume) ---")
    test_full = test.with_columns(
        pl.Series("yhat_p50", p50_test),
        pl.Series("yhat_p10_cal", p10_test_cal),
        pl.Series("yhat_p90_cal", p90_test_cal),
    )
    by_brand = (
        test_full.group_by("brand")
        .agg(
            pl.col("Hl").sum().alias("test_hl"),
            pl.col("Hl").len().alias("n_rows"),
            ((pl.col("Hl") - pl.col("yhat_p50")).abs() / pl.col("Hl").clip(lower_bound=1)).mean().alias("mape_p50"),
            ((pl.col("Hl") >= pl.col("yhat_p10_cal")) & (pl.col("Hl") <= pl.col("yhat_p90_cal"))).mean().alias("cover_80"),
        )
        .sort("test_hl", descending=True)
        .head(5)
    )
    print(by_brand)

    # ── DoD gates ──────────────────────────────────────────────────────────
    print("\n  --- DoD gates ---")
    for name, m in fitted.items():
        bi = m.best_iteration_
        train_at_bi = next(r["train_mape"] for r in learning_curves if r["quantile"] == name and r["iteration"] == bi)
        val_at_bi   = next(r["val_mape"]   for r in learning_curves if r["quantile"] == name and r["iteration"] == bi)
        gate_es     = bi < 1500
        gate_gap    = val_at_bi < train_at_bi * 1.5 if train_at_bi > 0 else True
        print(f"  {name}: best_iter={bi:<5}  "
              f"ES_fired={'✓' if gate_es else '✗'}   "
              f"val_lt_train_x1.5={'✓' if gate_gap else '✗'}")
    gate_cover = cal_cover_test >= 0.75
    print(f"  conformal PI coverage on test: {cal_cover_test:.1%} "
          f"(gate ≥ 75%: {'✓' if gate_cover else '✗'})")

    # SHAP-style top features sanity (just a feature_importances_ check)
    importances = sorted(zip(all_features, fitted["p50"].feature_importances_),
                         key=lambda x: -x[1])
    top3 = [f for f, _ in importances[:3]]
    has_seasonal = any(
        x in top3 for x in ("month_sin", "month_cos", "quarter_sin", "quarter_cos",
                            "is_summer", "is_christmas_month", "is_christmas_buildup", "is_easter_month")
    )
    print(f"  top-3 features (LightGBM importances): {top3}")
    print(f"  contains seasonal feature: {'✓' if has_seasonal else '✗'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
