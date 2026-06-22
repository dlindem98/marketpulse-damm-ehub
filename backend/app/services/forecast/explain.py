"""SHAP explainer for the LightGBM p50 model.

Produces:
  - models/shap_explainer.joblib   — pickled TreeExplainer
  - snapshots/drivers.parquet      — top-3 SHAP drivers per (sku, sub_channel, date)
                                      for the production forecast horizon

Driver grouping (used at /api/drivers): SHAP features are bucketed into
families (Recent trend, Calendar effect, Seasonality, Weather, Market trend,
Channel mix, Promo) so end-users see business-readable labels instead of
raw feature names.
"""

from __future__ import annotations

import warnings

import joblib
import numpy as np
import polars as pl
import shap

from app.paths import MODELS_DIR as MODELS, SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path
from app.services.forecast.features import build_features

warnings.filterwarnings("ignore", message="X does not have valid feature names")

WIDE = snapshot_path("wide_monthly.parquet")
FORECAST = snapshot_path("forecast.parquet")


FAMILY_RULES: list[tuple[str, str]] = [
    ("lag_",           "Recent trend"),
    ("roll_mean_",     "Recent trend"),
    ("month_sin",      "Seasonality"),
    ("month_cos",      "Seasonality"),
    ("quarter_sin",    "Seasonality"),
    ("quarter_cos",    "Seasonality"),
    ("month",          "Calendar effect"),
    ("quarter",        "Calendar effect"),
    ("year",           "Calendar effect"),
    ("is_christmas_month", "Calendar effect (Christmas)"),
    ("is_easter_month", "Calendar effect (Easter)"),
    ("is_summer",      "Calendar effect (Summer)"),
    ("is_christmas_buildup", "Calendar effect (pre-Christmas)"),
    ("uk_holidays_count", "Calendar effect"),
    ("temp_c",         "Weather"),
    ("trends_",        "Brand search demand"),
    ("ons_",           "UK retail market trend"),
    ("brand_te",       "Brand mix"),
    ("sub_channel_te", "Channel mix"),
    ("sales_channel_te","Channel mix"),
]


def family_for(feature: str) -> str:
    for prefix, family in FAMILY_RULES:
        if feature.startswith(prefix):
            return family
    return "Other"


def main() -> int:
    print("=" * 72)
    print("STEP 9 — SHAP explainer + driver groupings")
    print("=" * 72)

    monthly = pl.read_parquet(WIDE)
    df, numeric, categorical = build_features(monthly)
    df = df.drop_nulls(subset=numeric + ["Hl"])

    p50 = joblib.load(MODELS / "lgb_p50.joblib")
    te = joblib.load(MODELS / "target_encoder.joblib")

    # We compute SHAP on the LAST historical month per series (a representative
    # explainer input); each row becomes the driver-set the dashboard shows
    # when a user clicks "Why is the forecast at this gap?"
    last_rows = (
        df.sort("date")
        .group_by(["material_id", "sub_channel"], maintain_order=True)
        .tail(1)
    )
    enc = te.transform(last_rows.select(categorical).to_pandas())
    enc = enc.rename(columns={c: f"{c}_te" for c in categorical})
    last_rows = pl.concat([last_rows, pl.from_pandas(enc)], how="horizontal")
    features = numeric + [f"{c}_te" for c in categorical]
    X = last_rows.select(features).to_numpy()
    print(f"\n[1/3] computing SHAP for {len(last_rows)} (sku, sub_channel) tuples")

    explainer = shap.TreeExplainer(p50)
    shap_values = explainer.shap_values(X)  # shape (n_rows, n_features)
    print(f"      shap_values shape: {shap_values.shape}")
    joblib.dump(explainer, MODELS / "shap_explainer.joblib")

    print(f"\n[2/3] top-3 drivers per (sku, sub_channel)")
    rows: list[dict] = []
    for i in range(shap_values.shape[0]):
        contribs = list(zip(features, shap_values[i]))
        # Sort by absolute SHAP magnitude
        contribs.sort(key=lambda x: -abs(x[1]))
        material_id = last_rows.row(i, named=True)["material_id"]
        sub_channel = last_rows.row(i, named=True)["sub_channel"]
        for rank, (feat, val) in enumerate(contribs[:3], 1):
            rows.append({
                "material_id": material_id,
                "sub_channel": sub_channel,
                "rank": rank,
                "feature": feat,
                "family": family_for(feat),
                "shap_value": float(val),
                "direction": "positive" if val > 0 else "negative",
            })

    drivers = pl.DataFrame(rows)
    drivers.write_parquet(SNAPSHOTS / "drivers.parquet")
    print(f"      snapshots/drivers.parquet ({len(drivers):,} rows)")

    print(f"\n[3/3] sample drivers for hero (EX23SRAN × GROCERY):")
    hero = drivers.filter(
        (pl.col("material_id") == "EX23SRAN") & (pl.col("sub_channel") == "GROCERY")
    )
    print(hero)

    print("\nSTEP 9 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
