# ML strategy — modeling spec

Concrete decisions, tied to what the data audit revealed. No "we'll figure it out at H8."

> All numbers below come from the live audit of `UK DATA.xlsx` (Jan 2023 → Apr 2026, 25,389 UK rows after the customer-code join, 191 customers, 199 SKUs, 31 brands). See [DATA.md](DATA.md) for the audit details.

---

## 0. The data realities that drive every decision

| Reality | Implication |
|---|---|
| 21% of rows have **null Hl** — these are budget/plan rows, not actuals | Tag and split in ETL. Train only on actuals. |
| 1,186 rows have **negative Hl** (returns/credit notes) | Net them against same `(cliente, material, month)` before training. |
| **40% of UK volume is one customer (CMBC, B2B distribution to Carlsberg)** | Train a separate model for CMBC. Mixing it into retail dilutes both. |
| **117 of 471 SKU×SubChannel series have ≤2 months** of history (cold-start) | Global training (one model, all series) — only path that works. |
| **32 of 82 Brand×SubChannel series have ≥24 months** | Brand×SubChannel is the sweet spot for evaluation/visuals. |
| **Strong seasonality: peak/trough = 2.07× (Mar peak, Jan trough)** | Difference-12 transform before fit; date_features = [month, quarter]. |
| **Promo plan only covers GROCERY subchannel (~31% of UK volume)** | Promo features only meaningful on GROCERY. Don't pollute other models. |
| **Forecast horizon: Apr 2026 → end of 2026 (8 months out)** | Train through Mar 2026, forecast Apr–Dec 2026. |

---

## 1. Target & granularity

- **Target column:** `Hl` (volume). Secondary: `Venta Neta` (revenue), forecast separately, used for ROI.
- **Granularity:** **monthly, primary.** Sales data is monthly (`AÑO CALENDARIO` = `Abr.25` etc.).
- **Weekly view** (for `/forecast` Week tab) = monthly forecast disaggregated into ISO weeks by the per-channel promo calendar. Not modeled directly.
- **Forecast level:** `SKU × SubChannel`. Reconciled up to Brand×SubChannel → SubChannel → SalesChannel → Total via `hierarchicalforecast`.

---

## 2. Train/val/test split

| Slice | Months | Rows | Purpose |
|---|---|---|---|
| Train | Jan 2023 → Sep 2025 (33 mo) | ~13k actual rows | Model fit |
| Validation (rolling) | Oct 2025, Nov 2025, Dec 2025 (3 origins × 3-month horizons) | — | Hyper-tuning, ensemble weights, MAPE table |
| Test (held out) | Jan 2026 → Mar 2026 (3 mo) | ~1.7k actual rows | Final eval shown in `/forecast` MAPE panel |
| **Production forecast** | **Apr 2026 → Dec 2026 (9 mo)** | — | What the dashboard shows |

Rolling-origin CV is implemented with `MLForecast.cross_validation(n_windows=3, h=3, step_size=1)`.

---

## 3. The model ensemble

Three components, ensembled at the SKU × SubChannel × month level.

### Component A — Global LightGBM via MLForecast (workhorse)

One model, fit jointly on **all 471 SKU×SubChannel series**. Cold-start series borrow strength from long ones via the shared trees.

**Robustness controls** ([D-010](DECISIONS.md), [D-011](DECISIONS.md)). With only ~19k training rows and 500+ trees per quantile, the model can memorize *and* its prediction intervals can be mis-calibrated. We stack six independent safeguards:

1. **Early stopping** — train up to `n_estimators=1500`, stop when val MAPE plateaus 50 rounds. Self-picks tree count per quantile. (D-010)
2. **L2 regularization** — `reg_lambda=0.1` on leaf weights. (D-010)
3. **Bagging + column subsampling** — `bagging_fraction=0.8`, `bagging_freq=5`, `feature_fraction=0.8`. Free variance reduction. (D-011 B)
4. **K-fold-safe target encoding** for `brand`, `sub_channel`, `sales_channel` — `category_encoders.TargetEncoder(smoothing=10.0)` fitted on TRAIN ONLY per fold. (D-011 C)
5. **Fourier seasonality + holiday calendar flags** — `month_sin`, `month_cos`, `quarter_sin`, `quarter_cos`, `is_christmas_month`, `is_easter_month`, `is_summer`, `is_christmas_buildup`. (D-011 D, E)
6. **Conformalized Quantile Regression (CQR)** for PI calibration — compute `qhat` on a held-out calibration slice, emit `[p10 - qhat, p90 + qhat]` as the 80% PI. Distribution-free coverage guarantee. (D-011 A)

Plus the **learning curve artifact** (per-iteration train+val MAPE → `snapshots/learning_curves.parquet`) and the **calibration artifact** (`snapshots/calibration.parquet` with `qhat`, raw vs. calibrated coverage).

```python
from mlforecast import MLForecast
from mlforecast.lag_transforms import RollingMean, RollingStd
from mlforecast.target_transforms import Differences
import lightgbm as lgb

QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}

def make_model(alpha: float) -> lgb.LGBMRegressor:
    return lgb.LGBMRegressor(
        objective="quantile", alpha=alpha,
        n_estimators=1500,            # upper bound; early stopping picks the real count
        learning_rate=0.05,
        num_leaves=63,
        min_data_in_leaf=20,
        # D-010: L2 regularization
        reg_lambda=0.1,
        # D-011 B: bagging + column subsampling
        bagging_fraction=0.8, bagging_freq=5,
        feature_fraction=0.8,
        random_state=42,
        verbose=-1,
    )

models = {name: make_model(q) for name, q in QUANTILES.items()}

fcst = MLForecast(
    models=models,
    freq="MS",                                  # month-start
    lags=[1, 3, 6, 12],
    lag_transforms={
        1:  [RollingMean(window_size=3),  RollingMean(window_size=6),  RollingMean(window_size=12)],
        12: [RollingMean(window_size=3),  RollingStd(window_size=6)],
    },
    date_features=["month", "quarter"],
    target_transforms=[Differences([12])],      # remove yearly seasonality before fit
)

# Fit with early stopping + per-iteration metric capture
# The last 3 months of training data are the early-stopping validation slice
es_callbacks = [
    lgb.early_stopping(stopping_rounds=50, verbose=False),
    lgb.record_evaluation(eval_dict := {}),
]
fcst.fit(
    train_df,
    fit_kwargs={
        "eval_set": [(X_val, y_val)],
        "eval_metric": "mape",
        "callbacks": es_callbacks,
    },
)
# Persist learning curves for the /diagnostics page
write_learning_curves(eval_dict, SNAPSHOTS / "learning_curves.parquet")
```

The training script logs `best_iteration_` per quantile. Spike on real Phase 1 data: p10 stopped at 87, p50 at 159, p90 at 237 — all well below the 1500 cap, healthy convergence pattern.

### Conformalized Quantile Regression (CQR) for prediction-interval calibration

Quantile-loss output doesn't *guarantee* its quantile target on out-of-sample data. Spike showed 59.8% empirical coverage on a nominal 80% PI — unacceptable for a commercial tool. CQR closes that gap distribution-free:

```python
def conformalize(y_calib, p10_calib, p90_calib, level=0.8):
    scores = np.maximum(p10_calib - y_calib, y_calib - p90_calib)
    n = len(scores)
    q_level = min(np.ceil((n + 1) * level) / n, 1.0)
    return float(np.quantile(scores, q_level, method="higher"))

# At inference time:
lo_calibrated = p10_pred - qhat
hi_calibrated = p90_pred + qhat
```

The calibration slice should be held out from both training and early-stopping signal — in the production pipeline it's the last 8 weeks of training data (before the val window).

### Categorical encoding — TRAIN-ONLY target encoding with smoothing

```python
from category_encoders import TargetEncoder
te = TargetEncoder(cols=["brand", "sub_channel", "sales_channel"], smoothing=10.0)
te.fit(X_train, y_train)              # NEVER on val/test
X_train_enc = te.transform(X_train)
X_val_enc   = te.transform(X_val)
X_test_enc  = te.transform(X_test)
```

Sanity assertion: encoded `sub_channel_te.mean()` should differ between train and val (different time windows → different channel mixes). The spike showed train=499 vs val=584 for sub_channel — confirms no leakage.

### Feature engineering — Fourier + holiday calendar

```python
df = df.with_columns(
    (2 * np.pi * pl.col("month") / 12).sin().alias("month_sin"),
    (2 * np.pi * pl.col("month") / 12).cos().alias("month_cos"),
    (2 * np.pi * pl.col("quarter") / 4).sin().alias("quarter_sin"),
    (2 * np.pi * pl.col("quarter") / 4).cos().alias("quarter_cos"),
    (pl.col("month") == 12).cast(pl.Int8).alias("is_christmas_month"),
    (pl.col("month").is_in([6, 7, 8])).cast(pl.Int8).alias("is_summer"),
    (pl.col("month").is_in([10, 11])).cast(pl.Int8).alias("is_christmas_buildup"),
    # is_easter_month — derived from `holidays.country_holidays("GB")` and the
    # month containing each year's Easter Monday
)
```

#### Features fed to the LightGBM

**Static (per series):**
- `brand` (31 categorical → target-encoded)
- `sub_channel` (6 categorical → one-hot)
- `sales_channel` (3 categorical → one-hot)
- `pack_type` (CAN / NR BOTTLE / KEG / PET / RET BOTTLE / TANKER)
- `pack_size` (categorical bucket)
- `alc_pct` (numeric)
- `is_cmbc_customer` (binary; CMBC is 40% of volume)
- `months_since_first_sale` (cold-start signal)

**Dynamic (per month, per series):**
- Lags 1, 3, 6, 12; rolling means 3/6/12; rolling std 6 (set above)
- `month`, `quarter` (date_features)
- `is_uk_holiday_count` (number of UK bank holidays in the month — from `holidays` pkg)

**Channel-conditional exogenous** *(passed via `X_df` argument, not as static)*:
- For `sub_channel == 'GROCERY'`: `promo_active`, `promo_event` (one-hot of event types from the trade plan), `discount_pct`
- For all subchannels: `uk_temp_c_mean` (Open-Meteo monthly), `uk_temp_anomaly_c`, `ons_retail_index`, `trends_estrella` (Google Trends monthly)
- For `is_cmbc_customer == 1`: `cmbc_replenishment_lag` (custom 1-month autocorrelation residual)

> **Rule:** features only enter where they're meaningful. The promo plan never enters an ON-TRADE row because Tesco/Sainsbury's promos don't drive pub footfall.

### Component B — StatsForecast AutoARIMA (per-series baseline)

Fast sanity baseline. Useful where the series is long and clean (the 32 Brand×SubChannel series with ≥24 months, and the 6 SubChannel-only series with the full 40 months).

```python
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, AutoETS

sf = StatsForecast(
    models=[AutoARIMA(season_length=12), AutoETS(season_length=12)],
    freq="MS",
    n_jobs=-1,
)
```

Used only at the **Brand × SubChannel** aggregation level (82 series). Not at SKU level — too noisy.

### Component C — Zero-shot foundation models via HF Inference

Two models, deployed where each wins.

| Model | When to call | Why |
|---|---|---|
| **`Salesforce/moirai-1.1-R-large`** | GROCERY series only | Accepts `dynamic_real_features` (the promo plan) → it sees our domain data |
| **`amazon/chronos-bolt-base`** | Everything else, especially cold-start (≤6 months) | No covariates, fastest, best published zero-shot on short series |

Calls go through HF Inference Providers (the `EHubBarcelona` org token from `~/.cache/huggingface/token`). Each call is cached to Parquet keyed by `(model, sku, sub_channel, hash(history))` so re-runs during development don't burn tokens.

### Ensembling

At the SKU × SubChannel × month grid, the final point forecast is:

```
final = w_lgb · lgb_p50 + w_chr · chronos + w_moi · moirai_or_0
```

Where weights `(w_lgb, w_chr, w_moi)` are **per-SubChannel** and **per-horizon**, learned by minimizing validation MAPE via constrained least squares (`scipy.optimize.minimize` with `w_i ∈ [0,1]`, `sum(w_i) = 1`). For non-GROCERY rows, `w_moi = 0` by construction.

Intervals: take the **LightGBM p10/p90** as the 80% interval. Conformal-style widening (×1.05) absorbs the variance added by ensembling. Don't try to ensemble intervals from heterogeneous models.

### CMBC carve-out

CMBC is 40% of UK volume and behaves like B2B replenishment, not retail demand. Two-model trick:

```python
# 1. Train on non-CMBC only (target = sum_hl_minus_cmbc)
non_cmbc_forecast = fcst.fit(df_non_cmbc).predict(h=9)

# 2. Separate AutoARIMA on CMBC's own series at Brand×SubChannel level (it's clean)
cmbc_forecast = sf.fit(df_cmbc_brand_subch).predict(h=9)

# 3. Sum at the matching grain
total = non_cmbc_forecast + cmbc_forecast
```

This avoids CMBC's distributor-replenishment noise polluting the SKU-level retail signal.

---

## 4. Hierarchical reconciliation

Bottom-up, then optimal-combination via `hierarchicalforecast`.

```
              UK total
                │
        ┌───────┼───────┐
     ON-TRADE  OFF-TRADE  MDD              (Sales Channel — 3 nodes)
        │       │         │
   ┌────┴────┐  …                          (SubChannel — 6 leaves of this level)
 FREE-TR-  NATIONAL …
 CMBC      ON-TRADE
        │
     ┌──┴──┐
   brand brand …                           (Brand × SubChannel — 82 nodes)
    │
   SKU SKU SKU …                           (SKU × SubChannel — 471 leaves)
```

```python
from hierarchicalforecast.core import HierarchicalReconciliation
from hierarchicalforecast.methods import MinTrace

hrec = HierarchicalReconciliation(
    reconcilers=[MinTrace(method="mint_shrink")]
)
Y_rec = hrec.reconcile(Y_hat, S, tags, Y_df=Y_train)
```

`MinTrace(mint_shrink)` over plain bottom-up — it uses the in-sample residual covariance to spread top-level information back down, improving SKU-level forecasts by ~5–15% MAPE in published benchmarks.

**Effect on the dashboard:** every aggregation (brand, sub-channel, total) the user sees adds up *exactly*. No more "the brand chart says 12,000 but the SKU rows sum to 12,140."

---

## 5. Anomaly detection (historical)

For each Brand × SubChannel series with ≥24 months, run STL decomposition then flag months where the residual exceeds 2.5 × MAD:

```python
from statsmodels.tsa.seasonal import STL
from scipy.stats import median_abs_deviation as mad

stl = STL(series, period=12, robust=True).fit()
resid = stl.resid
threshold = 2.5 * mad(resid, scale="normal")
anomalies = resid[abs(resid) > threshold]
```

For each anomaly, attach a `candidate_cause` by scanning that month's exogenous deltas:
- `|temp_anomaly| > 1.5σ` → "Weather: {sign}{Δ}°C vs typical"
- `promo_active changed` → "Promo {event} ran/didn't run"
- `holidays_count delta` → "Calendar: {n} more/fewer UK holidays"
- else → "Unexplained"

Surfaced on the `/forecast` chart as red dots and on the anomaly sheet.

---

## 6. SHAP for explainability

`shap.TreeExplainer(lgb_p50_model)` on the p50 LightGBM. Per gap (SKU × SubChannel × month):

1. Compute SHAP values for that single row's prediction.
2. Take top 3 |SHAP|, group by feature family:
   - `promo_*` → "Promotion coverage"
   - `temp_*` → "Weather"
   - `trends_*` → "Brand search demand"
   - `holidays_*` → "Calendar effects"
   - `lag_*`, `rolling_*` → "Recent trend"
3. Generate a one-sentence human label via the LLM (`fast` profile, see [AGENT.md](AGENT.md)), constrained by Instructor to `Driver.explanation: str`.

This is what the agent's `explain_gap(sku, channel, period)` tool returns.

---

## 7. Promotion lift (causal)

`tfcausalimpact` (Google CausalImpact reimplemented in TF) is run **only on GROCERY × Brand** series, one per historical promo event in the trade plan.

```python
from causalimpact import CausalImpact

# For each historical promo event in trade plan:
#   pre_period  = 12 weeks before promo start
#   post_period = promo weeks
#   y           = the Brand × GROCERY Hl series (weekly disaggregation)
#   X           = same brand on a non-GROCERY channel (counterfactual)
ci = CausalImpact(data, pre_period, post_period)
lift = ci.summary_data.loc["average", "rel_effect"]   # % lift
```

For each `(promo_type, channel)` we store:
- `avg_lift_pct`, `avg_lift_hl`
- `estimated_cost` (manually annotated; fallback to `None`)
- `roi = (avg_lift_hl × revenue_per_hl) / estimated_cost`
- `n_observations`, `confidence` (`high` if ≥5 obs and CausalImpact p-value < 0.05; `medium` if ≥3 obs; else `low`)

This is what `rank_promos()` returns.

Outside GROCERY: skip. There's no usable counterfactual structure on the ON-TRADE side.

---

## 8. What-if simulator (the `/simulator` killer feature)

Given a `SimulationRequest(sku, channel, months, discount_pct, promo_type)`:

1. Build a "baseline" exogenous frame for the target months (no promo).
2. Build a "simulated" exogenous frame: set `promo_active=1`, `promo_event=promo_type`, `discount_pct=discount_pct` for the chosen months.
3. Re-predict with the fitted LightGBM ensemble on both frames.
4. Compute `gap_before` (baseline vs budget) and `gap_after` (simulated vs budget).
5. `gap_closed_pct = (gap_before - gap_after) / abs(gap_before)`.
6. `estimated_cost = sum_months(promo_type_unit_cost × baseline_volume)` (from the promo-cost map; `None` if unknown).

Constraint enforced server-side: simulation only runs for `sub_channel == 'GROCERY'`. Outside GROCERY the simulator returns `SimulationResult(notes="Promo simulation is only supported in the GROCERY subchannel for this hackathon.", ...)`.

---

## 9. Cross-validation MAPE table (judges will ask)

The `/forecast` page has a small "Model accuracy" sheet that shows:

| Model | MAPE @ Brand × SubChannel | MAPE @ SKU × SubChannel | Coverage @ 80% PI |
|---|---|---|---|
| Naive seasonal | x.x% | x.x% | — |
| AutoARIMA | x.x% | n/a | — |
| LightGBM (ours) | x.x% | x.x% | x.x% |
| Chronos-Bolt | x.x% | x.x% | — |
| Moirai-1.1 (GROCERY only) | x.x% | x.x% | — |
| **Ensemble + reconciled** | **x.x%** | **x.x%** | **x.x%** |

Numbers filled at H10 from the 3-fold rolling CV on Oct/Nov/Dec 2025.

---

## 10. What runs where (compute budget)

| Task | Where | Time |
|---|---|---|
| Polars ETL + feature build | local CPU | ~30s for full data |
| LightGBM fit (471 series × 3 quantiles) | local CPU | ~2 min (LightGBM is fast) |
| AutoARIMA on 82 series | local CPU (n_jobs=-1) | ~1 min |
| Chronos-Bolt × 471 series | HF Inference (Novita route) | ~4 min, cached after |
| Moirai-1.1 × GROCERY series (~150) | HF Inference | ~3 min, cached after |
| Hierarchical reconciliation | local CPU | <10s |
| SHAP TreeExplainer on a single row | local CPU | <50ms |
| CausalImpact per promo (~30 events) | local CPU | ~2 min total |
| Anomaly STL × 82 series | local CPU | <30s |

**Total cold-start training pass: ~10 minutes.** Cached forecasts re-load in seconds.

---

## 11. Definition of done

- [ ] All training data has `is_actual = True` (null and negative Hl handled per §0)
- [ ] CMBC carve-out implemented and validated against summed totals (within ±0.1%)
- [ ] LightGBM ensemble + Chronos + (Moirai on GROCERY) trained, intervals computed
- [ ] Hierarchical reconciliation passes the "children sum to parent" assertion
- [ ] Validation MAPE table populated; ensemble weights persisted to `models/weights.json`
- [ ] LightGBM early stopping fires at < 1500 trees (logged as `best_iteration_` per quantile)
- [ ] `snapshots/learning_curves.parquet` written, shows train vs val MAPE per iteration; final val MAPE < (final train MAPE) × 1.5  (gap-to-train sanity check — flags overfit)
- [ ] `snapshots/calibration.parquet` written with `qhat`, raw_pi_width, cal_pi_width, raw_cover, cal_cover
- [ ] **Calibrated 80% PI coverage on test ≥ 65%** (spike baseline). Full ensemble with per-channel CQR targets ≥75%.
- [ ] `cal_pi_width / raw_pi_width ≤ 1.5` — CQR mustn't widen the PI to infinity; it must correct coverage by adding signal
- [ ] **Top-10 features by importance** include at least one of: Fourier feature, holiday flag, target-encoded category (lags alone shouldn't dominate the entire ranking)
- [ ] Target-encoded mean on val differs from train mean for at least one categorical (proves no leakage)
- [ ] SHAP explainer pickled to `models/shap_explainer.pkl` for fast `/api/drivers` calls
- [ ] All forecasts + intervals snapshotted to `backend/app/data/snapshots/forecast.parquet`
- [ ] Anomaly events written to `snapshots/anomalies.parquet`
- [ ] Promo causal results written to `snapshots/promo_roi.parquet`
- [ ] Simulator function passes a sanity test (10% off-invoice on `EX23SRAN × GROCERY` shrinks the November gap)

---

## 12. Known limitations (acknowledged, not silently buried)

Things the plan **cannot** fully solve in 24h. Each one is a real model risk; the dashboard surfaces a note where applicable so judges and users aren't surprised.

| Limitation | Why it persists | How we mitigate (partial) |
|---|---|---|
| **Distribution shift between val and test windows.** The spike showed val (Nov-25 to Jan-26) and test (Feb-26 to Apr-26) carry different channel mixes; CQR raised coverage 59.8% → 71.3% but couldn't fully close to 80%. | The data set has 40 months total; the last 6 are split val+test, leaving only 152 calibration rows. Conformal quantile is noisy at that scale. | Per-channel CQR (separate qhat per sub_channel), and the ensemble averages out some of the shift. Surface the empirical coverage on the `/forecast` accuracy panel. |
| **Sparse-SKU variance.** 117 of 471 series have ≤2 months of history. Their forecasts borrow heavily from other series via the global model. | No more data exists for these SKUs. | Chronos-Bolt zero-shot fallback covers cold-start; SHAP per-row stays honest about uncertainty; intervals widen for them. |
| **Outlier-dominated training.** A single 5σ month (COVID-era spike, supply shock, new-listing ramp) influences the global gradient. | We don't manually annotate outliers. | Quantile p50 (median) is robust to outliers by construction; ensemble averaging dampens any one model's reaction. |
| **CMBC-as-distributor pattern.** 40% of UK volume is one B2B replenishment relationship that doesn't behave like retail demand. | Modeling B2B replenishment properly needs an inventory-flow signal we don't have. | Carve out CMBC into a separate AutoARIMA series ([ML.md §3](ML.md)); recombine at the dashboard level. |
| **No real budget data.** The "budget rows" in the source file are accounting noise ([D-008](DECISIONS.md)); targets are derived from prior-year actuals. | The brief mentions a budget but didn't include one. | `target_source ∈ {"prior_year", "trailing_median"}` exposed on every row so the FE can show confidence per cell. |
| **Promo causal counterfactual is shaky outside GROCERY.** tfcausalimpact assumes a valid sibling-channel counterfactual; that's only defensible in GROCERY where the promo plan applies. | Other channels don't have promo activity comparable to retail. | Skip promo causal analysis outside GROCERY; surface `n_observations` and `confidence` per `PromoROI` row so the FE can hide low-confidence rankings. |

The `KnownLimitations` set above is what we'd put on a methodology slide if asked. Better to be honest about model boundaries than oversell.
- [ ] MAPE table renders on `/forecast` page
