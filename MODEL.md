# Model

How the forecast, the explainability, the simulator, and the LLM layer fit together. Everything in this doc is grounded in code that runs — file paths are real and linkable.

## Production target

Monthly hectolitres (`Hl`) at `material_id × sub_channel × month`. The UI labels this *"SKU × channel"*. A forecast point is `(SKU, channel, future month) → predicted hL`.

A weekly view is available via `/api/forecast?granularity=week` — it's a deterministic ISO-week split of the monthly forecast (see [services/weekly_split.py](backend/app/services/weekly_split.py)), not a separately-trained weekly model.

## Training pipeline

One command:

```bash
make train
```

Runs [services/forecast/train.py](backend/app/services/forecast/train.py) which orchestrates 11 steps. The interesting ones:

| Step | Module | Purpose | Output |
|---|---|---|---|
| 1 | `train_lgb` | LightGBM quantile models (p10, p50, p90) on the monthly panel | model joblib + learning curves |
| 3 | `zeroshot` | `amazon/chronos-bolt-base` foundation-model forecast (no Damm training) | `forecasts_zeroshot.parquet` |
| 4 | `cmbc` | StatsForecast carve-out for `FREE TRADE CMBC` (B2B replenishment, different behavior) | `forecasts_cmbc.parquet` |
| 5 | `ensemble` | Blend LGB + Chronos + Chronos-Promo + AutoARIMA + CMBC with channel-specific weights | **`forecast.parquet`** (canonical) |
| 7 | `calibrate` | Per-channel interval calibration so the 80% band is actually 80% | calibrated columns on `forecast.parquet` |
| 8 | `cv` | Rolling-origin CV (train on past, predict 3 months ahead, slide cutoff forward) | `mape.parquet` |
| 9 | `explain` | SHAP on the LGB p50 → top features per SKU × channel | `drivers.parquet` |
| 11 | `causal` | Historical promo lift estimation by (promo_type × brand) | `promo_roi.parquet` |

### Features the LGB model uses

Lags (1, 3, 6, 12), rolling means (3, 6, 12), month/quarter, sin/cos seasonality, calendar flags (`is_christmas_month`, `is_summer`, `is_christmas_buildup`, `is_easter_month`), UK holiday count, and the external series (weather, search trends, ONS retail). Categorical SKU/channel/brand are target-encoded with smoothing (no val/test leakage).

What the model does **not** see directly: planned promos (not joined into the training panel) and one-off mega-events (World Cup, Euros — only fire every 2-4 years so LGB has 0-1 training instances). Both are handled separately:
- Promos: simulator applies a deterministic lift curve at runtime (see [services/forecast/simulate.py](backend/app/services/forecast/simulate.py)).
- One-off events: ensemble step applies a +5% post-forecast boost to affected months ([services/calendar.py](backend/app/services/calendar.py)), calibrated from Euros 2024 — see [DATA.md](DATA.md#event-importance-and-evidence-for-the-boost).

## Ensemble weights per channel

| Sub-channel | LGB | Chronos | Chronos-Promo | AutoARIMA | CMBC |
|---|---|---|---|---|---|
| GROCERY | 0.45 | 0.25 | 0.30 | – | – |
| FREE TRADE CMBC | – | – | – | – | 1.00 |
| NATIONAL ON TRADE | 0.55 | 0.30 | – | 0.15 | – |
| FREE TRADE | 0.55 | 0.30 | – | 0.15 | – |
| CONVENIENCE & WHOLESALE | 0.55 | 0.30 | – | 0.15 | – |
| MDD COPACKING | 0.70 | 0.30 | – | – | – |

Source: `DEFAULT_WEIGHTS` in [services/forecast/ensemble.py](backend/app/services/forecast/ensemble.py).

## Accuracy

Rolling-origin CV (3 folds, walk-forward):

| Level | MAPE |
|---|---|
| brand × sub_channel | **44.2%** |
| SKU × sub_channel | **127.3%** |

SKU-level MAPE is high because long-tail SKUs swing wildly month-to-month at this resolution. Brand-level aggregation reduces variance and brings MAPE back to a usable band. The UI mostly reads from SKU-level for action items (the inbox) and brand/channel-level for portfolio readouts (the pulse + rollups).

## Forecast vs target

Forecast = `Hl_hat_p50` from `forecast.parquet`.
Target = derived `target_hl` from `targets.parquet` (prior-year same-month actuals or trailing median; see [DATA.md](DATA.md#targets) for why we derive rather than read).

```
gap_hl  = forecast_hl − target_hl
gap_pct = gap_hl / target_hl
```

Negative gap = forecast below target. The chart shows the median forecast (solid), 80% confidence band (shaded), and target (dashed).

## LLM layer

LLMs turn model outputs into business language. They never invent forecasts — the numeric source of truth stays Parquet.

Router: [services/llm.py](backend/app/services/llm.py).

| Profile | Model | Provider | Used for |
|---|---|---|---|
| `fast` | `meta-llama/Llama-3.3-70B-Instruct` | Groq | low-latency explain / chat |
| `deep` | `moonshotai/Kimi-K2-Instruct` | Novita | recommendations + briefs |
| `fallback` | `Qwen/Qwen2.5-72B-Instruct` | HF auto | provider failure recovery |

Token: `HF_TOKEN` from `backend/.env` or `~/.cache/huggingface/token`.

### LLM-backed endpoints

| Endpoint | Role | Fallback |
|---|---|---|
| `/api/recommend` | 3 commercial scenarios (conservative / balanced / aggressive) for SKU × channel × period | deterministic scenario set |
| `/api/explain-view` | Headline + bullets summarising visible dashboard state | deterministic generic summary |
| `/api/brief` | Customer-call brief content | deterministic brief text |
| `/api/chat` | Conversational route | depends on router behavior |

### What the LLM is **not** allowed to do

- Invent customer or supermarket names (data is anonymized — see [DATA.md](DATA.md#anonymization))
- Change forecast numbers
- Hide uncertainty
- Claim "official budget" when our target is derived
- Claim promo lift not present in the ROI context

These rules are enforced in the system prompts and via the deterministic fallback paths.

## What the LLM gets as context

For `/api/recommend` it receives the forecast point, the target, the gap, top SHAP drivers, and historical promo ROI for the SKU's brand × channel. It returns structured JSON validated via Pydantic before reaching the UI.

For `/api/brief` it gets the customer's at-risk SKU basket (top 5), the channel + period, recent news context, and meeting timing — produces a structured brief with headline, push-forward narrative, per-SKU asks, market context links, and agenda.

If the model returns malformed JSON or the provider fails, the deterministic fallback fires and the UI still renders without an empty state.

## Known limits

- No official budget file; we derive a `target_hl` proxy.
- Weekly forecast is a deterministic split of monthly, not a separately-trained model.
- Promo-to-SKU matching is brand/label based — the promo Excel uses retailer SKU names, not Damm material IDs.
- External context for forecast months without actuals uses prior-year-same-month as a proxy, flagged in the API response.
- `/api/recommend` may return fallback scenarios when the LLM is unavailable.

### Rolled-back experiments

These were tried, measured, and rolled back. Documented here so the same ground doesn't get re-tilled.

- **Event-importance as model features** (`event_importance_score`, `event_high/med/low`). Added to `EXTERNAL_COLS`, MAPE worsened by ~3pp at brand level and ~15pp at SKU level in 3-fold CV. Recurring events are already captured by `month` + `is_christmas_month` + `uk_holidays_count`; truly one-off events have insufficient history. Replaced with a deterministic post-forecast +5% boost for World Cup / Euros months only (`services/calendar.py`).
- **Planned-promo intensity as model features** (`n_planned_promos`, `avg_planned_discount`, sourced from the Damm Trade Plan and aggregated to brand × GROCERY × month by `attach_planned_promos` in `services/etl.py`). Added to `EXTERNAL_COLS`, MAPE delta was exactly 0.00pp at both brand and SKU level in 3-fold CV — LightGBM never split on the feature because the trade plan only covers months from late 2025 onwards, leaving ~98% of training rows at the (0, 0.0) default. To get signal we'd need historical promo flags reconstructed from past actuals (price-drop detection) or a retrospective extension of the plan; neither is available in the provided dataset. The columns remain in `wide_monthly` because the simulator and the decision-page "Planned promos" card both consume them at runtime.
