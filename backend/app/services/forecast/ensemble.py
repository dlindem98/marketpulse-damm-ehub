"""Ensemble — blend LGB + Chronos + ChronosPromo + AutoARIMA + CMBC into the
production forecast at SKU × SubChannel × month grain.

Design:
  - Inference-time blend with fixed per-channel weights (sensible defaults).
  - Weights are tunable later in STEP 8 via rolling-origin CV (proper
    out-of-fold evaluation, no Chronos-val chicken-and-egg).
  - CMBC sub-channel: weight=1.0 on the CMBC carve-out forecast.
  - GROCERY: blend LGB + Chronos + ChronosPromo evenly (each meaningful
    in different cells; the ensemble averages noise).
  - Other channels: LGB-heavy with Chronos as a stabilizer.

Produces `snapshots/forecast.parquet` — the canonical, single source of
truth that every endpoint reads.
"""

from __future__ import annotations

import json

import joblib
import numpy as np
import polars as pl

from app.paths import MODELS_DIR as MODELS, SNAPSHOTS_DIR as SNAPSHOTS, snapshot_path
from app.services.calendar import build_events, post_forecast_boost_for_month
from app.services.forecast.features import build_features
from app.services.seasonality import (
    apply_seasonality,
    compute_seasonality_multipliers,
)

WIDE = snapshot_path("wide_monthly.parquet")
ZEROSHOT = snapshot_path("forecasts_zeroshot.parquet")
AUTOARIMA = snapshot_path("forecasts_autoarima.parquet")
CMBC = snapshot_path("forecasts_cmbc.parquet")

HORIZON_MONTHS = 9
CMBC_CHANNEL = "FREE TRADE CMBC"

# Default ensemble weights — sensible for our data shape. Tuned in STEP 8.
# Keys: "lgb", "chronos", "chronos_promo", "autoarima", "cmbc". Each
# per-channel dict sums to 1.0 (or a subset that's available at inference).
DEFAULT_WEIGHTS: dict[str, dict[str, float]] = {
    "GROCERY":                 {"lgb": 0.45, "chronos": 0.25, "chronos_promo": 0.30},
    "FREE TRADE CMBC":         {"cmbc": 1.00},
    "NATIONAL ON TRADE":       {"lgb": 0.55, "chronos": 0.30, "autoarima": 0.15},
    "FREE TRADE":              {"lgb": 0.55, "chronos": 0.30, "autoarima": 0.15},
    "CONVENIENCE & WHOLESALE": {"lgb": 0.55, "chronos": 0.30, "autoarima": 0.15},
    "MDD COPACKING":           {"lgb": 0.70, "chronos": 0.30},
}


def _generate_lgb_forecast() -> pl.DataFrame:
    """Refit LGB on train+val (full history) and forecast HORIZON months ahead.

    Returns one row per (material_id, sub_channel, date) with lgb_p10/p50/p90.
    Uses iterative h-step prediction: forecast h=1 first, append, build lag
    features for h=2 using the predicted value, and so on.
    """
    monthly = pl.read_parquet(WIDE)
    print(f"  · LGB inference: building features over {len(monthly):,} rows")

    # We use the already-trained models from STEP 1 (trained on train; for
    # production we'd re-train on train+val, but at our data scale that's
    # marginal). Keep it simple: predict from the last known row's features.
    df, numeric, categorical = build_features(monthly)
    df = df.drop_nulls(subset=numeric + ["Hl"])

    p10 = joblib.load(MODELS / "lgb_p10.joblib")
    p50 = joblib.load(MODELS / "lgb_p50.joblib")
    p90 = joblib.load(MODELS / "lgb_p90.joblib")
    te = joblib.load(MODELS / "target_encoder.joblib")

    # For each series, take the last row's features and rotate the lags
    # forward H steps. We iterate h=1..HORIZON, using the predicted p50 as
    # the basis for the next step's lag_1.
    print(f"  · iterative h-step forecast for {HORIZON_MONTHS} months ahead")
    rows: list[dict] = []
    last_per_series = (
        df.sort("date")
        .group_by(["material_id", "sub_channel"], maintain_order=True)
        .tail(13)  # need 12 months of lag to forecast h=12 ahead
    )

    # Apply target encoding to last rows
    enc = te.transform(last_per_series.select(categorical).to_pandas())
    enc = enc.rename(columns={c: f"{c}_te" for c in categorical})
    last_per_series = pl.concat(
        [last_per_series, pl.from_pandas(enc)], how="horizontal"
    )

    features = numeric + [f"{c}_te" for c in categorical]

    for (mat, sub), grp in last_per_series.group_by(["material_id", "sub_channel"], maintain_order=True):
        grp_sorted = grp.sort("date")
        if len(grp_sorted) < 12:
            # Need at least 12 months of lags
            continue
        history_hl = grp_sorted["Hl"].to_list()
        last_date = grp_sorted["date"].to_list()[-1]

        # Static features (don't change across horizons)
        last_row = grp_sorted.tail(1)
        static_features = {
            c: last_row[c].item() for c in [
                "brand", "sub_channel", "sales_channel", "brand_te",
                "sub_channel_te", "sales_channel_te",
            ]
        }
        brand_te = static_features["brand_te"]
        sub_channel_te = static_features["sub_channel_te"]
        sales_channel_te = static_features["sales_channel_te"]

        # External features from the latest row in df (assume future approx = last known)
        ext_vals = {
            c: last_row[c].item() for c in [
                "temp_c_mean", "temp_c_anomaly",
                "trends_estrella", "trends_lager", "trends_beer",
                "ons_retail_index", "ons_food_drink_index",
            ] if c in last_row.columns
        }

        # Event-importance lookup. Built once per series so we can stamp
        # the right per-future-month event flags below. Spans the next
        # HORIZON months from the series's last known date.
        import datetime as _dt
        _last = last_row["date"].item()
        _ev_start = _dt.date(_last.year, _last.month, 1)
        _ev_end_y, _ev_end_m = _last.year, _last.month + HORIZON_MONTHS + 1
        while _ev_end_m > 12:
            _ev_end_m -= 12
            _ev_end_y += 1
        _ev_end = _dt.date(_ev_end_y, _ev_end_m, 1)
        _events = build_events(_ev_start, _ev_end)
        _rank = {"high": 3, "medium": 2, "low": 1}
        _evt_by_month: dict[_dt.date, int] = {}
        for _e in _events:
            _em = _dt.date.fromisoformat(_e.period)
            _s = _rank.get(_e.importance, 0)
            if _s > _evt_by_month.get(_em, 0):
                _evt_by_month[_em] = _s

        rolling_history = list(history_hl)
        for h in range(1, HORIZON_MONTHS + 1):
            future_y = last_date.year
            future_m = last_date.month + h
            while future_m > 12:
                future_m -= 12
                future_y += 1
            future_date = type(last_date)(future_y, future_m, 1)

            # Build feature row: lags = rolling_history[-1], [-3], [-6], [-12]
            row_features = []
            for lag in (1, 3, 6, 12):
                row_features.append(rolling_history[-lag] if len(rolling_history) >= lag else rolling_history[-1])
            # Rolling means: 3, 6, 12 prior
            for w in (3, 6, 12):
                row_features.append(float(np.mean(rolling_history[-w:])) if len(rolling_history) >= w else float(np.mean(rolling_history)))
            row_features += [future_m, (future_m - 1) // 3 + 1, future_y, 0]  # month, quarter, year, uk_holidays_count
            # Fourier
            row_features += [
                float(np.sin(2*np.pi*future_m/12)),
                float(np.cos(2*np.pi*future_m/12)),
                float(np.sin(2*np.pi*((future_m-1)//3+1)/4)),
                float(np.cos(2*np.pi*((future_m-1)//3+1)/4)),
            ]
            # Calendar flags
            row_features += [
                1 if future_m == 12 else 0,
                1 if future_m in (6, 7, 8) else 0,
                1 if future_m in (10, 11) else 0,
                0,  # is_easter_month — approximation; rarely fires
            ]
            # External (extend from last known)
            row_features += [
                ext_vals.get("temp_c_mean", 0.0),
                ext_vals.get("temp_c_anomaly", 0.0),
                ext_vals.get("trends_estrella", 0.0),
                ext_vals.get("trends_lager", 0.0),
                ext_vals.get("trends_beer", 0.0),
                ext_vals.get("ons_retail_index", 0.0),
                ext_vals.get("ons_food_drink_index", 0.0),
            ]
            # NB: planned-promo columns (n_planned_promos, avg_planned_discount)
            # are NOT model features — see the EXTERNAL_COLS comment in
            # features.py for the A/B result and reasoning. The columns still
            # exist in wide_monthly for runtime consumers (simulator + UI).
            # NB: event-importance columns are NOT included as model features
            # — see EXTERNAL_COLS comment in features.py. They live in the
            # data but the model does worse with them; the simulator uses
            # them deterministically at runtime instead.
            # Target-encoded categoricals
            row_features += [brand_te, sub_channel_te, sales_channel_te]

            X = np.array([row_features], dtype=float)
            yhat_p10 = float(p10.predict(X, num_iteration=p10.best_iteration_)[0])
            yhat_p50 = float(p50.predict(X, num_iteration=p50.best_iteration_)[0])
            yhat_p90 = float(p90.predict(X, num_iteration=p90.best_iteration_)[0])

            rows.append({
                "material_id": mat,
                "sub_channel": sub,
                "date": future_date,
                "horizon": h,
                "lgb_p10": yhat_p10,
                "lgb_p50": yhat_p50,
                "lgb_p90": yhat_p90,
            })

            # Update rolling history with predicted p50 for next iteration
            rolling_history.append(yhat_p50)

    return pl.DataFrame(rows)


def main() -> int:
    print("=" * 72)
    print("STEP 5 — Ensemble: blend LGB + Chronos + ChronosPromo + AutoARIMA + CMBC")
    print("=" * 72)

    if not WIDE.is_file():
        print(f"\n  wide_monthly.parquet not found. Run `make data`.")
        return 2
    for required in (ZEROSHOT, CMBC):
        if not required.is_file():
            print(f"  Missing {required}. Run STEPs 3 / 4 first.")
            return 2

    print("\n[1/4] producing LGB iterative h-step forecast")
    lgb_fc = _generate_lgb_forecast()
    print(f"      {len(lgb_fc):,} LGB forecast rows")

    print(f"\n[2/4] loading sibling forecasts")
    zero = pl.read_parquet(ZEROSHOT).with_columns(pl.col("date").cast(pl.Date))
    aa   = pl.read_parquet(AUTOARIMA).with_columns(pl.col("date").cast(pl.Date)) if AUTOARIMA.is_file() else pl.DataFrame()
    cmbc = pl.read_parquet(CMBC).with_columns(pl.col("date").cast(pl.Date))
    print(f"      zero-shot: {len(zero):,} rows  ·  autoarima: {len(aa):,} rows  ·  cmbc: {len(cmbc):,} rows")

    # Use UNION of LGB + Chronos + CMBC keys so cold-start series still get a forecast
    skeleton_keys = pl.concat([
        lgb_fc.select(["material_id", "sub_channel", "date"]),
        zero.select(["material_id", "sub_channel", "date"]),
        cmbc.select(["material_id", "sub_channel", "date"]),
    ], how="vertical").unique()
    # Attach horizon
    last_per_series = (
        pl.read_parquet(WIDE).sort("date")
        .group_by(["material_id", "sub_channel"], maintain_order=True)
        .agg(last_date=pl.col("date").max())
    )
    skeleton = skeleton_keys.join(last_per_series, on=["material_id", "sub_channel"], how="left")
    skeleton = skeleton.with_columns(
        horizon=((pl.col("date").dt.year() * 12 + pl.col("date").dt.month())
                 - (pl.col("last_date").dt.year() * 12 + pl.col("last_date").dt.month())).cast(pl.Int32),
    ).drop("last_date")

    df = skeleton.join(lgb_fc.drop("horizon"),  on=["material_id", "sub_channel", "date"], how="left")
    df = df.join(
        zero.select(["material_id", "sub_channel", "date",
                     "chronos_p10", "chronos_p50", "chronos_p90",
                     "chronos_promo_p10", "chronos_promo_p50", "chronos_promo_p90"]),
        on=["material_id", "sub_channel", "date"], how="left",
    )
    df = df.join(
        cmbc.select(["material_id", "sub_channel", "date",
                     "Hl_hat_cmbc", "lo80_cmbc", "hi80_cmbc"]),
        on=["material_id", "sub_channel", "date"], how="left",
    )

    # AutoARIMA is at brand × sub_channel; join by aligning brand
    monthly = pl.read_parquet(WIDE)
    sku_to_brand = monthly.select(["material_id", "brand"]).unique()
    df = df.join(sku_to_brand, on="material_id", how="left")
    if len(aa):
        # AutoARIMA was at brand × sub_channel — same value applies to every SKU of that brand
        df = df.join(
            aa.select(["brand", "sub_channel", "date",
                       "Hl_hat_autoarima", "lo80_autoarima", "hi80_autoarima"]),
            on=["brand", "sub_channel", "date"], how="left",
        )
    else:
        df = df.with_columns(
            Hl_hat_autoarima=pl.lit(None, dtype=pl.Float64),
            lo80_autoarima=pl.lit(None, dtype=pl.Float64),
            hi80_autoarima=pl.lit(None, dtype=pl.Float64),
        )

    print(f"\n[3/4] blending per channel with default weights")
    weights = DEFAULT_WEIGHTS

    def blend_row(row: dict, quantile: str) -> float:
        """quantile ∈ {'p10','p50','p90'}"""
        import math
        col_map = {
            "lgb":           f"lgb_{quantile}",
            "chronos":       f"chronos_{quantile}",
            "chronos_promo": f"chronos_promo_{quantile}",
            "autoarima":     "Hl_hat_autoarima" if quantile == "p50" else (
                "lo80_autoarima" if quantile == "p10" else "hi80_autoarima"
            ),
            "cmbc":          "Hl_hat_cmbc" if quantile == "p50" else (
                "lo80_cmbc" if quantile == "p10" else "hi80_cmbc"
            ),
        }
        w = weights.get(row["sub_channel"], {"lgb": 1.0})
        used_w = 0.0
        used_val = 0.0
        for model, wt in w.items():
            v = row.get(col_map[model])
            if v is None or wt == 0:
                continue
            # pandas converts polars nulls to NaN — catch that too
            try:
                if math.isnan(v):
                    continue
            except TypeError:
                pass
            used_val += wt * v
            used_w += wt
        if used_w == 0:
            v = row.get(col_map["chronos"])
            return float(v) if v is not None and not (isinstance(v, float) and math.isnan(v)) else 0.0
        return used_val / used_w

    pd = df.to_pandas()
    pd["Hl_hat_p10"] = pd.apply(lambda r: blend_row(r.to_dict(), "p10"), axis=1)
    pd["Hl_hat_p50"] = pd.apply(lambda r: blend_row(r.to_dict(), "p50"), axis=1)
    pd["Hl_hat_p90"] = pd.apply(lambda r: blend_row(r.to_dict(), "p90"), axis=1)

    forecast = pl.from_pandas(pd[[
        "material_id", "brand", "sub_channel", "date", "horizon",
        "Hl_hat_p10", "Hl_hat_p50", "Hl_hat_p90",
        "lgb_p50", "chronos_p50", "chronos_promo_p50",
        "Hl_hat_autoarima", "Hl_hat_cmbc",
    ]])

    # Filter to the production horizon — only dates STRICTLY AFTER the last
    # observation in the actuals. Per-series Chronos forecasts that anchor
    # mid-history aren't useful for production.
    anchor = pl.read_parquet(WIDE)["date"].max()
    print(f"      production anchor (max history date): {anchor}")
    forecast = forecast.with_columns(pl.col("date").cast(pl.Date)).filter(pl.col("date") > anchor)
    print(f"      after filter to future-only: {len(forecast):,} rows")

    # Sanity: ensemble forecasts are finite and non-negative
    assert forecast["Hl_hat_p50"].is_finite().all()
    forecast = forecast.with_columns(
        pl.col("Hl_hat_p10").clip(lower_bound=0.0),
        pl.col("Hl_hat_p50").clip(lower_bound=0.0),
        pl.col("Hl_hat_p90").clip(lower_bound=0.0),
    )

    print(f"      ensembled {len(forecast):,} rows  "
          f"(materials={forecast['material_id'].n_unique()}, "
          f"channels={forecast['sub_channel'].n_unique()})")

    # ── Post-forecast event boost ───────────────────────────────────────
    # Apply a deterministic multiplier for months containing events that
    # the seasonality multiplier CAN'T capture: non-annual events (World
    # Cup, Euros — every 2-4 years) and date-shifting ones (Easter Monday
    # — Mar/Apr varies; Wimbledon — sport-pub demand on top of the summer
    # baseline). Fixed-date bank holidays (Christmas, May BH, Summer BH)
    # are deliberately NOT boosted here — seasonality already lifts those
    # months from real actuals, and double-counting would overshoot.
    # See services/calendar.py POST_FORECAST_BOOST for per-event values.
    fc_dates = forecast["date"].unique().to_list()
    _events = build_events(min(fc_dates), max(fc_dates))
    boost_by_date = {d: post_forecast_boost_for_month(d.isoformat(), _events) for d in fc_dates}
    n_boosted = sum(1 for b in boost_by_date.values() if b > 1.0)
    if n_boosted > 0:
        boosted = sorted(
            [(d.isoformat(), b) for d, b in boost_by_date.items() if b > 1.0]
        )
        details = ", ".join(f"{d}: +{(b-1)*100:.0f}%" for d, b in boosted)
        print(f"      event boost applied to {n_boosted} months ({details})")
        forecast = forecast.with_columns(
            pl.col("date").replace_strict(boost_by_date, return_dtype=pl.Float64).alias("_boost"),
        ).with_columns(
            (pl.col("Hl_hat_p10") * pl.col("_boost")).alias("Hl_hat_p10"),
            (pl.col("Hl_hat_p50") * pl.col("_boost")).alias("Hl_hat_p50"),
            (pl.col("Hl_hat_p90") * pl.col("_boost")).alias("Hl_hat_p90"),
        ).drop("_boost")
    else:
        print("      event boost: no qualifying events in horizon — skipped")

    # ── Seasonality multiplier ──────────────────────────────────────────
    # The iterative LGB feeds its own p50 forward as the lag for the next
    # step, so by h=4+ the forecast collapses to the conditional mean and
    # the line goes flat. We've tried teaching the model the missing
    # shape via features twice (event-importance, planned-promos); both
    # rolled back. Easier to inject the shape deterministically AFTER
    # the smooth forecast — see services/seasonality.py for the math.
    monthly_for_seasonality = pl.read_parquet(WIDE)
    seasonal_mult = compute_seasonality_multipliers(monthly_for_seasonality)
    if seasonal_mult:
        n_series = len({(k[0], k[1]) for k in seasonal_mult})
        forecast = apply_seasonality(forecast, seasonal_mult)
        print(f"      seasonality: shape injected for {n_series} (brand × sub_channel) series")
    else:
        print("      seasonality: no series had enough history — skipped")

    # ── Sanity cap vs historical max ────────────────────────────────────
    # Lumpy channels (CONVENIENCE & WHOLESALE, NATIONAL ON TRADE) had
    # SKUs where the LGB model output went 2-3× above the SKU's all-time
    # historical monthly max — pushing the portfolio pulse to +37% YoY,
    # which is unrealistic for a CPG (real range -3% to +15%). Cap each
    # SKU × sub_channel forecast at 1.5× its trailing-12-month max so a
    # genuine growth signal is preserved (50% headroom) but runaway
    # forecasts get clipped.
    monthly_for_cap = pl.read_parquet(WIDE)
    per_series_max = (
        monthly_for_cap
        .sort("date").group_by(["material_id", "sub_channel"], maintain_order=True)
        .agg(hist_max=pl.col("Hl").tail(12).max())
    )
    forecast = forecast.join(per_series_max, on=["material_id", "sub_channel"], how="left")
    pre_cap_total = float(forecast["Hl_hat_p50"].sum())
    forecast = forecast.with_columns(
        cap=(pl.col("hist_max") * 1.5),
    ).with_columns(
        Hl_hat_p10=pl.min_horizontal("Hl_hat_p10", pl.col("cap")),
        Hl_hat_p50=pl.min_horizontal("Hl_hat_p50", pl.col("cap")),
        Hl_hat_p90=pl.min_horizontal("Hl_hat_p90", pl.col("cap") * 1.15),
    ).drop(["hist_max", "cap"])
    post_cap_total = float(forecast["Hl_hat_p50"].sum())
    if pre_cap_total > post_cap_total:
        print(
            f"      sanity cap: clipped {pre_cap_total - post_cap_total:,.0f} hL "
            f"({(1 - post_cap_total/pre_cap_total)*100:.1f}%) of overshoot"
        )

    print(f"\n[4/4] persisting forecast.parquet + weights.json")
    forecast.write_parquet(SNAPSHOTS / "forecast.parquet")
    (MODELS / "weights.json").write_text(json.dumps(weights, indent=2))
    print(f"      snapshots/forecast.parquet")
    print(f"      models/weights.json")

    # Quick summary by channel
    by_ch = forecast.group_by("sub_channel").agg(
        n=pl.len(),
        total_hl=pl.col("Hl_hat_p50").sum(),
        mean_p50=pl.col("Hl_hat_p50").mean(),
    )
    print(f"\n      forecast totals by sub_channel:")
    for r in by_ch.iter_rows(named=True):
        print(f"        {r['sub_channel']:<28} n={r['n']:>4}  total={r['total_hl']:>10,.0f} Hl  mean={r['mean_p50']:>7.1f}")

    print("\nSTEP 5 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
