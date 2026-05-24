"""Feature engineering for the forecast pipeline.

All feature construction lives here so train, CV, and inference use the
exact same logic. No leakage: features are built per-series, and any
target-derived encoding is fitted on train only (see `forecast.train_lgb`).
"""

from __future__ import annotations

from typing import Final

import holidays as hd
import numpy as np
import polars as pl


SERIES_KEYS: Final[list[str]] = ["material_id", "sub_channel"]
LAGS: Final[tuple[int, ...]] = (1, 3, 6, 12)
ROLLING_WINDOWS: Final[tuple[int, ...]] = (3, 6, 12)


def add_lag_features(df: pl.DataFrame) -> tuple[pl.DataFrame, list[str]]:
    """Lags 1, 3, 6, 12 of Hl per (material, sub_channel) series.

    Returns the augmented frame and the list of feature column names added.
    """
    out = df.sort(SERIES_KEYS + ["date"])
    cols: list[str] = []
    for lag in LAGS:
        col = f"lag_{lag}"
        out = out.with_columns(pl.col("Hl").shift(lag).over(SERIES_KEYS).alias(col))
        cols.append(col)
    return out, cols


def add_rolling_features(df: pl.DataFrame) -> tuple[pl.DataFrame, list[str]]:
    """Rolling means 3, 6, 12 of Hl. Always shifted by 1 to avoid look-ahead."""
    out = df
    cols: list[str] = []
    for w in ROLLING_WINDOWS:
        col = f"roll_mean_{w}"
        out = out.with_columns(
            pl.col("Hl").shift(1).rolling_mean(window_size=w, min_samples=1)
              .over(SERIES_KEYS).alias(col),
        )
        cols.append(col)
    return out, cols


def add_calendar_features(df: pl.DataFrame) -> tuple[pl.DataFrame, list[str]]:
    """Month / quarter / year + Fourier seasonality + holiday flags."""
    out = df.with_columns(
        # Fourier (smooth cyclic)
        (2 * np.pi * pl.col("month") / 12).sin().alias("month_sin"),
        (2 * np.pi * pl.col("month") / 12).cos().alias("month_cos"),
        (2 * np.pi * pl.col("quarter") / 4).sin().alias("quarter_sin"),
        (2 * np.pi * pl.col("quarter") / 4).cos().alias("quarter_cos"),
        # UK calendar effects (binary flags)
        (pl.col("month") == 12).cast(pl.Int8).alias("is_christmas_month"),
        (pl.col("month").is_in([6, 7, 8])).cast(pl.Int8).alias("is_summer"),
        (pl.col("month").is_in([10, 11])).cast(pl.Int8).alias("is_christmas_buildup"),
    )
    # Easter month (whichever month contains Easter Monday for that year)
    uk_holidays = hd.country_holidays("GB", years=range(2022, 2028))
    easter_months: set[tuple[int, int]] = {
        (d.year, d.month) for d, name in uk_holidays.items() if "Easter Monday" in name
    }
    out = out.with_columns(
        pl.struct(["year", "month"])
        .map_elements(lambda s: int((s["year"], s["month"]) in easter_months), return_dtype=pl.Int8)
        .alias("is_easter_month"),
    )
    cols = [
        "month", "quarter", "year", "uk_holidays_count",
        "month_sin", "month_cos", "quarter_sin", "quarter_cos",
        "is_christmas_month", "is_summer", "is_christmas_buildup", "is_easter_month",
    ]
    return out, cols


EXTERNAL_COLS: Final[list[str]] = [
    "temp_c_mean", "temp_c_anomaly",
    "trends_estrella", "trends_lager", "trends_beer",
    "ons_retail_index", "ons_food_drink_index",
    # NOTE: n_planned_promos / avg_planned_discount live in wide_monthly
    # (added by attach_planned_promos in etl.py) but we deliberately keep
    # them OUT of the model. A clean A/B on identical wide_monthly
    # measured ZERO MAPE delta at both brand and SKU level (Δ=0.00pp in
    # 3-fold CV) because the Damm Trade Plan only covers months from
    # late 2025 onwards — in training data spanning 2023-01..2026-04
    # both columns are zero for ~98% of rows, leaving LightGBM nothing
    # to split on. To make these features earn their place we'd need
    # historical promo flags reconstructed from the actuals (price-drops
    # detected in past sales) or a retrospective extension of the trade
    # plan; neither exists in the provided dataset. The columns stay in
    # wide_monthly because the simulator and the decision-page "Planned
    # promos" card both consume them at runtime.
    # NOTE: event_importance_score / event_high / event_med / event_low live
    # in wide_monthly.parquet (added by attach_event_importance in etl.py)
    # but we deliberately keep them OUT of the model. Adding them as
    # features measurably degraded MAPE (+3% brand-level, +15% SKU-level
    # in 3-fold CV) because the recurring events (Christmas, Boxing Day,
    # Wimbledon) are already captured by `month` + `is_christmas_month` +
    # `uk_holidays_count`, while the truly one-off events (World Cup,
    # Euros) only fire every 4 years — not enough history for LGB to learn
    # signal. The simulator (services/forecast/simulate.py) still consumes
    # them at runtime via event_boost_for_month() where the deterministic
    # multiplicative boost works better than a learned coefficient.
]


def build_features(monthly: pl.DataFrame) -> tuple[pl.DataFrame, list[str], list[str]]:
    """Run all feature builders. Returns (df, numeric_features, categorical_features).

    Numeric features include lags, rolling means, calendar/Fourier features,
    holidays, and externally-joined data (weather, Google Trends, ONS).

    Categorical columns are returned by name only — they're target-encoded
    later by the trainer using only training-fold rows.
    """
    df = monthly.sort(SERIES_KEYS + ["date"])
    df, lag_cols = add_lag_features(df)
    df, roll_cols = add_rolling_features(df)
    df, cal_cols = add_calendar_features(df)
    # External features are already columns in `monthly` — just declare them
    ext_cols = [c for c in EXTERNAL_COLS if c in df.columns]
    numeric = lag_cols + roll_cols + cal_cols + ext_cols
    categorical = ["brand", "sub_channel", "sales_channel"]
    return df, numeric, categorical


def time_split(
    df: pl.DataFrame, *, val_weeks: int = 12, test_weeks: int = 12,
) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Time-based train/val/test split. Never shuffle on time series.

    The last `test_weeks` are held out as test; the previous `val_weeks`
    drive early stopping; everything before is training.
    """
    last_date = df["date"].max()
    test_start = last_date - pl.duration(weeks=test_weeks)
    val_start  = test_start - pl.duration(weeks=val_weeks)
    return (
        df.filter(pl.col("date") < val_start),
        df.filter((pl.col("date") >= val_start) & (pl.col("date") < test_start)),
        df.filter(pl.col("date") >= test_start),
    )
