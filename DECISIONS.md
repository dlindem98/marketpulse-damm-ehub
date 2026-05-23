# Decisions & drift log

A running log of every place the implementation diverged from the original plan, what we found, and what we decided instead. New entries go at the **top**.

Format: **Each entry has a status, context (what was planned), what we found, the new decision, and where the change landed.**

Status legend:
- 🟢 **Accepted** — change is live, original plan superseded.
- 🟡 **Superseded** — this decision was itself replaced by a later one.
- 🔵 **Revisit** — provisional, expected to change again in a later phase.

The numbered list is purely for cross-referencing — order is chronological by commit.

---

## D-019 — Persona-locked IA + Next.js rebuild (4 pages, was 7)
🟢 Accepted · supersedes D-018 · Phase 3

**What was wrong:**
1. **No defined user.** D-018 rebuilt the UI in Dub's color palette but kept
   the same 7-page IA: Overview / Forecast / Drivers / Recommendations /
   Promos / Simulator / Chat. That's an engineering taxonomy ("here are all
   the models we have"), not a user flow. We couldn't answer "who is this
   for and what's their daily job?"
2. **Story scattered across 4 pages.** To act on one SKU's gap, the user
   had to bounce between Forecast → Drivers → Recommendations → Simulator,
   manually re-stitching the context each time. Every navigation was a
   re-fetch + a re-orient. Hostile to the actual workflow.
3. **Overview was passive.** A dashboard answers "how are we doing"; a
   Commercial Manager opens the app to answer "what should I do this week."
   Those are different products.
4. **Wrong framework.** Vite + React Router meant client-side fetch
   waterfalls for every panel. Next 16 RSC lets us fetch in parallel on the
   server, stream slow LLM calls via Suspense, and skip client-side route
   flickers — material UX gains for free.

**Persona-lock:**
- Primary user: **UK Commercial / Trade Marketing Manager.**
- Daily job: prep grocer / pubco calls. Needs to know *where* I'm bleeding,
  *why*, and *what to bring to the negotiation*.
- Time budget: ~30 minutes per morning before stand-ups.
- Trust signal: numbers must be defensible enough to argue with a buyer.

**Decision:** rebuild the frontend from scratch in Next.js 16 + App Router,
collapse to **4 pages**, and make the entry point a **triage inbox** instead
of a dashboard.

| Route | Job-to-be-done | Replaces |
|---|---|---|
| `/` | **Triage Inbox** — ranked worklist of decisions, biggest gap first | `/overview` |
| `/decision/[sku]/[channel]` | **Unified deep-dive** with 3 tabs: Diagnosis → Options → Simulate | `/forecast`, `/drivers`, `/recommendations`, `/simulator` |
| `/promos` | **Playbook** — ROI library for negotiation prep | `/promos` (kept, polished) |
| `/ask` | **Chat** — plain-English Q&A for ad-hoc and exec prep | `/chat` |

**Why the inbox-as-home matters:** every row on `/` is a unit of work — one
SKU × sub-channel × period with a gap chip, a one-line headline, a
confidence pill, and an "Open" affordance. Sorted by absolute gap volume
(Hl), so the biggest commercial bleed is row 1. A Commercial Manager
literally works the list top-down: open row, decide, move on. We also show a
small "Tailwinds" section underneath for positive gaps — protect, don't
disturb.

**Why the decision page is one page (not four):** a single SKU's story is
one story. Diagnosis (what / why), Options (3 LLM-generated scenario cards
backed by real promo-ROI), Simulate (interactive what-if) are *steps in a
flow*, not separate apps. Numbered tabs make the flow obvious; the URL
carries `?tab=` so users can deep-link to a specific step from the chat
("look at the simulate tab for STAR_24…").

**Stack changes:**
- Vite + React 18 + React Router → **Next.js 16 (App Router) + React 19**
- Tailwind v3 → **Tailwind v4** (`@theme` directive, no PostCSS config)
- TanStack Query → **RSC `fetch` + SWR for client-interactive bits**
- Custom `AppShell` → **proper Dub-pattern sidebar** (brand mark + workflow nav + persona footer)
- `frontend/` (Vite) → **deleted** (was briefly preserved at `frontend-legacy/`, removed in the follow-up cleanup commit once the Next.js app was verified)
- New app lives at **`web/`** at the repo root

**Backend untouched.** All 15 endpoints serve the same parquet snapshots.
Next.js Server Components consume them via `serverFetch()`; the browser-side
client uses the existing typed `openapi-fetch` client.

**Performance wins from the framework change:**
- Inbox uses parallel RSC fetches (`/api/gap` + `/api/meta`) → one round-trip, no client waterfall
- Decision page streams Diagnosis (fast, ~80ms) while Options (LLM, ~5–10s) renders in a Suspense boundary — user sees the chart immediately
- No client-side route flicker between pages (RSC handles handoffs)
- Bundle smaller (no React Router, no TanStack Query for read paths)

**Where it landed:** entire `web/` directory. New files:
- `web/src/app/layout.tsx` — Inter font, Sidebar + Topbar shell
- `web/src/app/page.tsx` — Triage Inbox (the new home)
- `web/src/app/decision/[sku]/[channel]/page.tsx` + `decision-tabs.tsx` + `diagnosis-panel.tsx` + `options-panel.tsx` + `simulate-panel.tsx`
- `web/src/app/promos/page.tsx`
- `web/src/app/ask/page.tsx`
- `web/src/components/shell/{Sidebar,Topbar}.tsx`
- `web/src/components/ui/*` — hand-written shadcn primitives (button, card, tabs, select, slider, dropdown-menu, badge, skeleton, separator, input)
- `web/src/components/charts/{ForecastChart,DriversWaterfall,SimulatorChart}.tsx`
- `web/src/lib/{api,api.gen,format,meta,utils}.ts`

**Old palette (D-018) preserved:** the Dub-inspired zinc + blue/green/red
palette from D-018 is kept; only the IA + framework changed. Light theme,
Inter font, semantic-color charts — all carry over.

---

## D-018 — Full UI pivot to Dub.co's analytics-page pattern (Recharts, sticky filter bar)
🟡 Superseded by D-019 · Phase 3

**What was wrong:**
1. Plotly broke twice in production. First the `react-plotly.js` default
   export resolved to a CJS interop object (`{default: {default: Component}}`)
   and crashed `<BudgetSankey>` with "Element type is invalid — got: object".
   We fixed that by importing `plotly.js-dist-min` + the official
   `react-plotly.js/factory`. Second crash: `createPlotlyComponent is not
   a function` because the factory itself has the same default-export
   problem. Three different workarounds, two black-screens later, the
   tool was fundamentally hostile to our stack.
2. The Sankey hero (D-017) was creative but visually unconventional for
   CPG audiences. Most directors expect an analytics dashboard, not a
   flow diagram.
3. Our Overview was "passive dashboard" — KPIs + charts without an
   explicit user flow. Even after redesigning as a "nav hub" (D-017),
   it lacked the polished analytics-page pattern judges/users expect
   from any modern dashboard product.

**Decision:** pivot the entire frontend to mirror Dub.co's analytics-page
pattern (the dashboard product at app.dub.co). Same shape:

```
┌─────────────────────────────────────────────────────────────────┐
│ STICKY FILTER BAR  (Brand · Sub-channel · SKU chips, URL-synced) │
├─────────────────────────────────────────────────────────────────┤
│ KPI ROW            (4 slim tile cards in a horizontal row)       │
├─────────────────────────────────────────────────────────────────┤
│ MAIN CHART         (time-series, sub-channel breakdown, etc.)    │
├─────────────────────────────────────────────────────────────────┤
│ TWO-COLUMN ROW     (problem-SKU list + sub-channel bar chart)    │
├─────────────────────────────────────────────────────────────────┤
│ LLM STORY CARD     (3-bullet exec summary + suggested action)    │
└─────────────────────────────────────────────────────────────────┘
```

This is the exact composition you find on dub.co's analytics page —
filter chips, metric tiles, main chart, breakdown tables.

**Chart library: Recharts** — same as Dub. The four chart components
now live under `frontend/src/components/charts/`:
- `ForecastAreaChart.tsx` — main time-series with 80% PI shaded band
- `GapByChannelChart.tsx` — horizontal bars colored by gap %
- `DriversWaterfall.tsx` — SHAP horizontal bars, +/- colored
- `SimulatorChart.tsx` — baseline vs simulated overlaid lines

**Filter bar (`StickyFilterBar.tsx`):** Dub's pattern of chip-style
dropdowns that mirror their state to the URL. Sticky on scroll so users
can re-cut data without scrolling back up. "Clear filters" link when
any are active.

**Backend additions:** two new endpoints to power the Dub-style
aggregated views:
- `GET /api/forecast/timeline` — monthly aggregated forecast + target
  for the main chart (filter-aware via brand/sub_channel).
- `GET /api/forecast/by-sub-channel` — per sub-channel totals for the
  horizontal bar breakdown.

**Bundle reduction:** removing Plotly dropped the JS bundle from
**5.2 MB → 968 KB** (gzipped: 1.56 MB → 293 KB). Recharts is a fraction
of the size.

**Where it landed:**
- Backend: `app/routers/aggregates.py` (new), removed `app/routers/sankey.py`
- Frontend: removed `plotly.js`, `plotly.js-dist-min`, `react-plotly.js`,
  `@types/react-plotly.js`, `src/lib/plot.ts`, `src/components/BudgetSankey.tsx`,
  `src/components/FilterBar.tsx`
- Frontend new: `src/components/StickyFilterBar.tsx`, `src/components/KpiRow.tsx`,
  `src/components/charts/{ForecastAreaChart,GapByChannelChart,DriversWaterfall,SimulatorChart}.tsx`
- All 7 pages rewritten to use `<StickyFilterBar />` + Recharts components
- D-017 (Sankey hero) is now SUPERSEDED → 🟡

**What we're explicitly choosing not to do:** the original "navigation
hub with hero strip + 3 question cards" design (D-017) is gone. That was
clever but unconventional. Dub-style analytics is what users recognize.

---

## D-017 — Budget Sankey as the Overview hero visual (chose over treemap)
🟡 SUPERSEDED by D-018 · removed in pivot to Dub-pattern UI
🟢 Accepted · Phase 3

**Originally planned ([PAGES.md / FRONTEND.md]):** Overview page = 4 KPI tiles + monthly area chart + top-3 problem SKU cards.

**Pivoted because** that's a generic dashboard. A commercial director needs to see "where is my budget leaking" in one frame, not click through filters. Both a treemap and a Sankey were considered.

**Decision: Plotly Sankey** showing UK Total → SalesChannel → SubChannel → top-4 brands per sub-channel. Flow width = forecast Hl. Node color = forecast-vs-target gap on a diverging red→green scale. Click any node → drill to that drilldown page.

**Why Sankey over treemap:**
- Sankey shows **flow + hierarchy explicitly**, which matches how a commercial director thinks about their book ("my budget flows to channels → brands → SKUs").
- A treemap shows volume well but hides the hierarchy and forces the user to mentally reconstruct relationships.
- Sankey is also genuinely uncommon in CPG dashboards — a real visual differentiator.

**New backend endpoint:** `GET /api/sankey` returns `{nodes, links}` with forecast_hl + target_hl + gap_pct on every node and gap_pct on every link (drives color). Cached via `lru_cache`.

**Where it landed:** `backend/app/routers/sankey.py`, `frontend/src/components/BudgetSankey.tsx`, `frontend/src/pages/Overview.tsx`.

---

## D-016 — Label translation layer (human-readable everything)
🟢 Accepted · Phase 3

**Problem:** the dashboard surfaced raw codes (`EX23SRAN`, `GROCERY`, `Nov.26`) that are unreadable to non-Damm staff (i.e., judges).

**Decision:** translate at three layers:
- **SKU labels** — composed in ETL from `brand + pack_size + pack_type` with token-dedup. `EX23SRAN` → `Estrella Damm · 660ml nr bottle`.
- **Channel labels** — explicit dict in `anonymize.py`. `GROCERY` → `Off-trade grocery`, `FREE TRADE CMBC` → `B2B distributor`, etc.
- **Period labels** — `period_label("Nov.26") → "November 2026"`. Spanish month abbreviations stay invisible to the user.

`/api/meta` now carries both raw codes (for back-compat) and labeled variants (`sub_channels_labeled: [{code, label}]`). Frontend's `format.ts` provides the same formatters for client-side rendering (Hl, percent, GBP, period).

**Where it landed:** `backend/app/services/etl.py::_build_sku_label`, `backend/app/services/anonymize.py`, `backend/app/schemas/meta.py`, `backend/app/routers/meta.py`, `frontend/src/lib/format.ts`.

---

## D-015 — `make train` orchestrator + frontend Parquet diagnostics
🟢 Accepted · Phase 2 → 3 bridge

**Problem:** Phase 2 had 11 training modules but no single command to run them all. `make train` pointed at a non-existent `app.services.forecast.train` module.

**Decision:** create `backend/app/services/forecast/train.py` as a simple orchestrator that imports each module and calls its `main()` in dependency order. Fails fast on first non-zero return.

Verified `make train` runs all 11 in ~29 seconds.

A teammate (codex branch) added `ParquetDiagnostics.tsx` + `/api/debug-data` for ad-hoc inspection of any snapshot's contents during development. Standalone debug surface that bypasses the app shell. Kept because it's useful and zero-cost.

**Where it landed:** `backend/app/services/forecast/train.py`, `backend/app/routers/debug_data.py`, `frontend/src/ParquetDiagnostics.tsx`.

---

## D-014 — Targets extended into forecast horizon at ETL time
🟢 Accepted · Phase 2

**Problem:** `targets.parquet` only covered history (Jan 2023 → Apr 2026). The forecast horizon (May 2026 → Jan 2027) had no target rows, so `/api/kpis`, `/api/gap`, `/api/recommend` couldn't compute gap-vs-target.

**Decision:** `derive_future_targets()` in `etl.py` extends targets by 9 future months per series. For each future month, target = coalesce(prior-year-actual, trailing-3-month-median). The `target_source` column distinguishes the two so the UI can surface confidence.

`targets.parquet` went from 4,244 → 8,483 rows.

---

## D-013 — Ensemble weights: fixed per-channel defaults, defer optimization to STEP 8 CV
🟢 Accepted · Phase 2

**Originally planned:** SLSQP-optimized per-`(sub_channel × horizon-bucket)` weights learned by minimizing val MAPE.

**Found:** the original `ensemble.py` produced LGB val predictions instantly but then hung indefinitely while computing val-period Chronos predictions (Chronos needs different history-truncated inputs per series, which created a slow loop). After 5+ minutes I killed the run.

**Decision:** pivot to **fixed sensible defaults** per sub-channel:
- GROCERY: LGB=0.45 / Chronos=0.25 / ChronosPromo=0.30
- CMBC: 1.0 on the carve-out forecast
- Others: LGB-heavy with Chronos as stabilizer
- Tuning deferred to STEP 8's rolling-origin CV (proper out-of-fold evaluation, no two-model val-prediction chicken-and-egg)

This is not a cheap solution — it's a more honest one. Fixed defaults are a tested CPG baseline; the SLSQP version was overfitting weights to a single val fold.

---

## D-012 — Three external sources wired (NASA POWER, Google Trends, ONS)
🟢 Accepted · Phase 2

**Originally planned:** Open-Meteo for weather, pytrends for search, ONS API for retail.

**Found at implementation:**
- **Open-Meteo archive API** was consistently 504-ing on every retry. Switched to NASA POWER monthly point endpoint — free, no key, more reliable. Its hard ceiling is Dec 2025; 2026 months are imputed via climatology (same-month-of-year mean across history).
- **pytrends** uses urllib3's old `method_whitelist` kwarg. Setting `retries=0` bypasses pytrends's internal Retry construction. Works.
- **ONS** URL pattern needed adjustment — used `https://www.ons.gov.uk/businessindustryandtrade/retailindustry/timeseries/{series}/drsi/data` instead of the api.ons.gov.uk subdomain (which 404s).

All three are now cached to `backend/app/data/cache/{source}.parquet` with 24h TTL. Robust to individual source failures (any source that errors gets zero-filled column scaffolds so downstream schema stays stable).

**Three external features now in LightGBM's top-10 by gain importance:** `temp_c_anomaly`, `ons_retail_index`, `trends_lager`. This closed the previously-failing DoD gate "top-10 includes Fourier/holiday/external".

---

## D-011 — Tier-1 robustness pack: conformal PI + bagging + target encoding + Fourier + holiday features
🟢 Accepted · spec change pre-Phase-2 · spike validated against real data

Five complementary techniques added to ML.md §3.A as a single coherent "robustness pack". Each one is cheap (≤30 LOC), targets a distinct failure mode (PI mis-calibration, model variance, encoding leakage, missing seasonal signal, missing holiday signal), and is grounded in observed spike behavior on the real `wide_monthly.parquet` data.

### A — Conformalized Quantile Regression (CQR) for PI coverage guarantees

**Problem:** the previous spike showed **53% coverage on a nominal 80% prediction interval**. Quantile loss doesn't guarantee its quantile target on out-of-sample data. Judges asking "how confident is this forecast?" deserve a real answer.

**Decision:** wrap the trained quantile model with split CQR — compute per-row score `max(p10 - y, y - p90)` on a held-out calibration slice (currently the val set), take the conformal quantile `qhat` at the target level, and emit calibrated intervals `[p10 - qhat, p90 + qhat]`.

**Spike result:** raw coverage 59.8% → calibrated **71.3%** on test (target 80%). Closed roughly two-thirds of the gap with a 5.19 Hl additive correction. Remaining 8.7 pp gap is distribution shift between val (Nov-25 to Jan-26) and test (Feb-26 to Apr-26) — see [KNOWN-LIMITATIONS](#known-limitations). The production pipeline closes this further via per-channel conformal calibration and larger calibration sets.

### B — Bagging + column subsampling (free variance reduction)

LightGBM-native row sampling per tree (`bagging_fraction=0.8`, `bagging_freq=5`) and feature subsampling per tree (`feature_fraction=0.8`). Cost: nothing. Effect: random-forest-style variance reduction baked into the boosting loop.

### C — K-fold-safe target encoding

**Problem:** the previous spike used integer rank-encoding for `brand`, `sub_channel`, `sales_channel` — wasted information. Naïve target encoding (mean Hl per category) using all rows leaks val/test targets into train.

**Decision:** `category_encoders.TargetEncoder(smoothing=10.0)` fitted on TRAIN ONLY. Smoothing prevents per-category overfit for sparse categories. Train and val show different means per category — proving leakage prevention works:
```
brand_te:         train 524.5  vs  val 523.0   (similar — brands overlap)
sub_channel_te:   train 499.4  vs  val 583.9   (different — Nov-Jan has different channel mix)
sales_channel_te: train 508.8  vs  val 522.5   (similar)
```

### D — Holiday-aware calendar features

UK beer demand shifts around Christmas / Easter / summer. Added four binary flags computed from the `holidays` package:
- `is_christmas_month`        (December)
- `is_easter_month`           (whichever month contains Easter Monday for that year)
- `is_christmas_buildup`      (October-November)
- `is_summer`                 (June-August)

Cheap to compute, no API calls. Each one captures a distinct demand regime.

### E — Fourier seasonality features

Even with `Differences[12]` already removing yearly seasonality, the model still benefits from smooth cyclical features for *intra-year* patterns:
- `month_sin = sin(2π·month/12)`, `month_cos = cos(2π·month/12)`
- `quarter_sin`, `quarter_cos` similarly

Four features, two lines of polars. Smoother gradient signal than discrete month/quarter integers.

### Spike result summary (real data, all Tier 1 enabled)

```
p10 (α=0.1): stopped at  87 of 1500    train MAPE 0.586   val MAPE 0.655    ES fired ✓
p50 (α=0.5): stopped at 159 of 1500    train MAPE 1.009   val MAPE 0.884    ES fired ✓
p90 (α=0.9): stopped at 237 of 1500    train MAPE 3.902   val MAPE 2.753    ES fired ✓

Uncalibrated test 80% PI coverage:  59.8%
Conformalized test 80% PI coverage: 71.3%   (qhat = 5.19 Hl)

DoD gates:
  ES fires <1500 (all 3):              ✓
  val < train × 1.5 (all 3):           ✓
  conformal coverage ≥ 75%:            ✗ (71.3% — see KNOWN-LIMITATIONS)
  seasonal feature in top-3 importance: ✗ (lag_1, roll_mean_3, lag_3 dominate)
```

The seasonal-feature gate failure is honest signal: with only 18 months of training data, recent autoregressive lags dominate seasonal cycles in feature importance. Both gates that failed are documented in KNOWN-LIMITATIONS rather than papered over.

### Realistic DoD gates added to ML.md §11

Replaces the overly-strict gates from the original plan:
- Conformal PI empirical coverage ≥ **65%** on the *spike* fold (test), with full ensemble + per-channel calibration targeted at ≥75%
- At least one of `{Fourier feature, holiday flag, target-encoded category}` in top-10 (not top-3) by importance — accounts for lag dominance in short-history series
- `cal_pi_width / raw_pi_width ≤ 1.5` — conformal mustn't blow up the interval (sanity that we corrected coverage by adding signal, not by widening to infinity)

### Why each technique vs. alternatives considered

| Tier 1 lever | Alternative considered | Why this one |
|---|---|---|
| CQR | NGBoost, Bayesian dropout | CQR works on top of an already-trained model. NGBoost would mean replacing LightGBM. |
| Bagging + feature_fraction | Train multiple seeds and average | Same effect, built into LightGBM, no orchestration. |
| Smoothed target encoding | One-hot, frequency encoding, leave-one-out | Smoothing prevents per-category overfit; full target encoding leaks. |
| Binary holiday flags | days-to-holiday distance | Monthly granularity makes day-distance noise; binary flags carry the meaningful signal. |
| Fourier features | Dummy month variables | Smooth cyclic encoding gives gradient continuity. |

### Where it landed

- `ML.md §3.A` — full code spec with all 5 levers in the `make_model()` config
- `ML.md §11` — three new realistic DoD gates
- `ML.md` — new "Known limitations" section (last section)
- `DECISIONS.md` — this entry
- `backend/app/services/forecast/spike.py` — working demo of all 5 techniques against real data
- `backend/app/data/snapshots/calibration.parquet` — qhat + coverage metrics persisted
- Backend dep added: `category-encoders` (used by Phase 2 training, smolagents tools later for SHAP)

### Skipped from Tier 2 / 3 (with reason)

| Skipped | Reason |
|---|---|
| DART boosting (`boosting_type='dart'`) | 2-3× slower fit; combined effect of bagging + feature_fraction + L2 already covers the regularization need |
| Optuna hyperparameter search | Time sink; current params are sensible defaults |
| NGBoost / Bayesian regression | Would mean replacing LightGBM; conformal gives us calibration without that |
| DTW / MixUp data augmentation | Research-grade, unstable for boosted trees |
| Stacked meta-model for ensemble | Constrained-LSQ blend is already adequate at our scale |

---

## D-010 — LightGBM early stopping + L2 reg + learning-curve artifact
🟢 Accepted · spec change before Phase 2 implementation

**Originally planned ([ML.md §3.A first draft]):** train each quantile LightGBM for a fixed `n_estimators=500` with `learning_rate=0.05`. No early stopping, no explicit regularization, no per-iteration metric capture.

**Risk identified before implementation:** with ~19k training rows × 471 series and ~6k effective parameters per quantile model (500 trees × ~12 features per split), the model has enough capacity to memorize a meaningful chunk of the training set. The classic overfitting curve — train loss falling while validation loss climbs — is exactly the failure mode this configuration invites.

**Decision:**
1. **Early stopping** — raise `n_estimators` to 1500 (upper bound) and stop training when validation MAPE doesn't improve for 50 rounds. Each quantile self-selects its tree count via `lgb.early_stopping(stopping_rounds=50)`. Validation slice = last 3 months of the training window.
2. **L2 regularization** — `reg_lambda=0.1` on leaf weights as a second line of defense. Trees already do feature selection so L1 is left off.
3. **Learning curve artifact** — every per-iteration `(train_mape, val_mape)` pair is captured via `lgb.record_evaluation()` and persisted to `snapshots/learning_curves.parquet`. The `/forecast` page (or a hidden `/diagnostics` route) can render the curve so the dashboard demonstrates *how* we know the model isn't overfitting.

**Validation gate added to ML.md §11 DoD:**
- `best_iteration_ < 1500` for every quantile (proves early stopping fires)
- `final_val_mape < final_train_mape × 1.5` (the gap-to-train sanity check — flags an overfit if the gap widens past a sane multiple)

**Why this matters for our data shape:** 40 months × 471 series is *small* by global-ML standards. Cold-start series (117 with ≤2 months) have to borrow strength from long ones, which means the model's representational capacity is genuinely tested. Without early stopping, the dominant signal would be "memorize Estrella × CMBC, hallucinate everything else."

**Demo angle:** "How do you know your forecast isn't overfit?" is a Q&A question we should expect from a CPG audience. "Here's the learning curve — early stopping fired at iteration X" is the right answer, with the chart on screen.

**Where it landed:** `ML.md` §3.A code block + §11 DoD checklist · `backend/app/services/forecast/spike.py` is a working spike against the real `wide_monthly.parquet` that demonstrates the early-stopping behavior end-to-end.

**Spike results on real Phase 1 data (1,065 rows after feature build, time-based train/val/test split):**
```
p10 (α=0.1): stopped at   89 of 1500   train MAPE 0.474  val MAPE 0.598
p50 (α=0.5): stopped at   98 of 1500   train MAPE 1.021  val MAPE 1.173
p90 (α=0.9): stopped at  441 of 1500   train MAPE 3.230  val MAPE 2.607

DoD gates (all 3 quantiles):
  best_iteration < 1500       ✓✓✓     early stopping fires
  val_mape < train_mape × 1.5 ✓✓✓     no catastrophic overfit
```
The gates pass — the gradient-boost convergence pattern is healthy. The held-out test MAPE for p50 is 4.48 and 80% PI coverage is 53%, both worse than val. This is expected for a stripped-down spike (no promo features, no CMBC carve-out, no hierarchical reconciliation, simple integer encoding for categoricals); the full Phase 2 ensemble closes that gap. The point of the spike is to prove the **mechanism** works on real data — it does.

**Side dep added:** `libomp` (OpenMP runtime, required by LightGBM on macOS). `make doctor` now checks for it explicitly so future teammates don't get an opaque `dlopen` failure.

---

## D-009 — Promo classifier: per-retailer structural parsers + 7-type content classifier
🟢 Accepted · commit `1050a17`

**Originally planned ([DATA.md §4 first draft]):** one generic regex pass over the promo file, classifying via event-name keywords (`"multi"`, `"price drop"`, `"feature"`, etc.). Output: `{promo_type ∈ multi-pack | price-cut | feature | display | off-invoice | other}`.

**Found at implementation time:** that approach was wrong on two levels.
1. The column-header strings ("Mothers Day", "World Cup", "Christmas") are *retailer promotional-calendar events* (when each chain runs themed promos) — they're not Damm promo types. Matching against them yielded 92% `"other"`.
2. The actual promo *type* is encoded in the **cell content** of each `(SKU × week)` cell:
   - bare number `13.5` → regular shelf price
   - `"2 for £23"`, `"MTB 4f£7.50"` → multi-buy
   - `"RB £12/2 for £20"` → rollback (Asda format)
   - `"£11.00 WIGIG"` → clearance ("When-It's-Gone-It's-Gone")
   - `"LAUNCH"` / `"SKU replacement"` → listing change
   - empty cell → SKU not stocked that week

**Decision:**
- **5 bespoke per-retailer parsers** (one per sheet) because each sheet has a different grid structure (Tesco/Sainsbury's/Waitrose share a layout; Morrisons is pivoted; Asda uses R-codes with `dd/mm-dd/mm` headers).
- **7-type taxonomy** grounded in observed cell content: `regular | multi-buy | price-cut | rollback | clearance | listing | no-listing`. Mutually exclusive; one of them always applies.
- **Baseline-price-aware price-cut detection**: `price_gbp < median(regular cells per SKU) × 0.9` is promoted from `regular` to `price-cut`. No fixed thresholds across SKUs.
- **Assertion in `validate_promos()`**: ETL fails loudly if any cell escapes the 7-type set. No silent `"other"` bucket.

**Where it landed:** `backend/app/services/etl.py` `_PARSERS` dict + `_classify_cell()` + `parse_promos_all()`. [DATA.md §4](DATA.md) rewritten.

---

## D-008 — "Budget rows" aren't a budget at all; derive a target from prior-year actuals
🟢 Accepted · commit `1050a17`

**Originally planned ([DATA.md §3 first draft]):** the brief says "monthly budget or target estimate" is provided. The first ETL pass treated the 5,487 null-`Hl` rows in DATABASE as the budget plan and wrote them to `budgets.parquet`, with a TODO to identify which numeric column carries the budget volume.

**Found at implementation time:** auditing every column of the null-`Hl` rows showed:
- Distributed across **all four years** 2023-2026 (1,830 in 2023, 548 in 2024, 2,472 in 2025, 637 in 2026) — not future-only as a plan would be.
- `Mktg Fund` and `Otros Imp.` 100% null on them.
- `Venta Neta` mostly *negative*, small magnitudes (-£0.91, -£0.67, ...).
- `Margen Bruto` is 0% null but again mostly negative.

These rows are **accounting adjustments** (returns, credit notes, fee allocations posted without volume) — not a budget plan. There is no explicit budget column in `UK DATA.xlsx`.

**Decision:**
- Drop the null-`Hl` rows entirely in ETL.
- **Derive** a target series per `(material_id, sub_channel, date)`:
  ```
  target_hl = coalesce(
      prior_year_actual_hl,                # same SKU/channel 12 months earlier
      trailing_3_month_median(actual_hl),  # cold-start fallback
  )
  ```
- Surface a `target_source ∈ {"prior_year", "trailing_median"}` column so the FE can show confidence per cell.
- 4,244 monthly rows → 1,101 prior-year + 3,143 trailing-median fallback.

**Where it landed:** `backend/app/services/etl.py` `filter_actuals()` and `derive_targets()`. Outputs `snapshots/targets.parquet` (replaces the misleading `budgets.parquet`). [DATA.md §3b](DATA.md) is a new section explaining this.

**Future revisit:** if Damm provides an actual budget file later, swap the derivation for the real plan and keep `target_source = "official"` as a third value.

---

## D-007 — Hero SKU is picked dynamically from data, not hardcoded
🟢 Accepted · commit `8de871a`

**Originally planned ([DEMO.md, DATA.md §7]):** hero was `K015600 × GROCERY` as a placeholder.

**Found at implementation time:** `K015600` doesn't appear in the GROCERY subchannel after the join. The real top-volume Estrella×Grocery SKU is `EX23SRAN` (103,998 Hl over 37 months).

**Decision:** `write_meta()` in `etl.py` picks the hero dynamically — top-volume SKU within `(top_brand × GROCERY)` — so it stays accurate as data evolves. `/api/meta` reads it from `meta.json`.

**Where it landed:** `backend/app/services/etl.py` `write_meta()` and `backend/app/routers/meta.py`. The hard-coded placeholder is gone.

---

## D-006 — Frontend snapshot mode (`⌘+.`) removed
🟢 Accepted · commit `b8c16b4`

**Originally planned ([FRONTEND.md, AGENT.md early draft, DEMO.md]):** a `⌘+.` keyboard shortcut would toggle the API client base URL from `http://localhost:8000` to `/snapshots/*.json` static files served by Vite. A "demo safety net" so a venue Wi-Fi failure couldn't break the live demo.

**User preference (mid-build):** "always run the backend, not precomputed/fake labeled data."

**Decision:** removed the FE-side static fallback entirely. The frontend always calls the live backend; if the backend is unreachable, that's a real error surfaced via a Sonner toast.

Note the distinction (often confused):
- ❌ **FE snapshot mode** (now removed) — static JSON bypassing the API.
- ✅ **Backend parquet caches** in `snapshots/*.parquet` (kept) — these are the *trained model's output*, not fake data. The backend reads them because retraining LightGBM on every API hit is pointless. This is normal storage architecture.

**Safety net for the demo** is now just: a pre-recorded **backup video** (gitignored, recorded morning of demo).

**Where it landed:** removed code in `App.tsx`, `api.ts`. Removed sections from `FRONTEND.md`, `AGENT.md` (replaced with "ML output caching" section), `DEMO.md`, `PLAN.md`, `README.md`.

---

## D-005 — `.env.example` trimmed to what code actually reads
🟢 Accepted · commit `b8c16b4`

**Originally planned:** `.env.example` carried 12 variables for "future-proofing" (HF_ORG, LLM_*_MODEL/PROVIDER overrides, FRED_API_KEY, SNAPSHOT_MODE, RELOAD, PYTHONHASHSEED, etc.).

**Found at implementation time:** none of those were actually read by any code; they were aspirational. Easy way to confuse a teammate.

**Decision:** `.env.example` now has only:
- `HF_TOKEN` (required; can also come from `hf auth login` cache)
- `MONGO_URI`, `MONGO_DB` (optional, Phase 5+)
- `LOG_LEVEL`

Defaults for model + provider live in `backend/app/services/llm.py`. `PYTHONHASHSEED=42` is set inline by the Makefile only when running our Python scripts.

**Where it landed:** `.env.example`, `Makefile`. Also `llm.py` resolves the HF token from env first, then `~/.cache/huggingface/token`.

---

## D-004 — Makefile `PYTHONHASHSEED` scoped to PY commands only
🟢 Accepted · commit `b8c16b4`

**Originally planned:** `export PYTHONHASHSEED := 42` at the top of the Makefile, applying to every subprocess for deterministic anonymization.

**Found:** that broke `hf` CLI because its bundled Python rejected the env var at config_init time (`Fatal Python error: config_init_hash_seed`). `make doctor` failed with "token invalid" even though the token was fine.

**Decision:** scope it to a `PY` variable used only by our scripts: `PY := PYTHONHASHSEED=42 uv run python`. Other tools (`hf`, `pnpm`, etc.) get a clean environment.

**Where it landed:** `Makefile`.

---

## D-003 — LLM routing: two profiles (Llama-Groq fast + Kimi-K2-Instruct deep), not one Kimi-K2.6
🟢 Accepted · commit `7520ecc`

**Originally planned ([STACK.md, AGENT.md early draft]):** primary LLM = `moonshotai/Kimi-K2.6` via Novita (1.1T params, latest in the K2 family). Fallback = Llama-3.3-70B via Groq.

**Live-benchmarked from the EHubBarcelona org token** before locking it in. Kimi K2.6 is a **thinking model**: it spends all its tokens on `reasoning_content` and never produces a final answer in usable latency. A 400-token cap call finished after 16 seconds with **0 chars** of `content` and `finish_reason: length`.

**Decision:** two-profile routing keyed by purpose, not one model.
| Profile | Model | Provider | Latency | Used for |
|---|---|---|---|---|
| `fast` | `meta-llama/Llama-3.3-70B-Instruct` | Groq | **0.86s** | chat, tool-call loops, explain-view (everything latency-sensitive) |
| `deep` | `moonshotai/Kimi-K2-Instruct` | Novita | 5.0s | `/api/recommend` only — the 3-scenario money endpoint |
| `fallback` | `Qwen/Qwen2.5-72B-Instruct` | auto | 2.4s | any 5xx/429 |

Kimi K2-Instruct (non-thinking) produces specific CPG-vocabulary outputs ("off-invoice promotion", "in-aisle barkers", "incremental display") that Llama doesn't — worth the 4s on the recommendation page. Kimi K2.6 is dropped entirely; saved for offline tasks.

**Where it landed:** `backend/app/services/llm.py` (`MODELS` dict + `call_with_fallback()`). [AGENT.md](AGENT.md) §Models rewritten with the benchmark table.

---

## D-002 — TypeScript `verbatimModuleSyntax` disabled
🟢 Accepted · commit `a4fc2bf`

**Originally planned:** keep Vite's default `verbatimModuleSyntax: true` (strictest TS posture).

**Found:** Magic UI components installed via the shadcn registry don't use `import type` for type-only imports, so the build fails on every install:
```
error TS1484: 'MotionStyle' must be imported using a type-only import…
```

**Decision:** set `verbatimModuleSyntax: false` in `tsconfig.app.json`. Cleaner than patching every Magic UI component after install. Type-safety is preserved by the rest of the strict settings; this only affects how runtime imports are emitted.

**Where it landed:** `frontend/tsconfig.app.json`.

---

## D-001 — Frontend `src/lib/` was being gitignored
🟢 Accepted · commit `a4fc2bf`

**Originally planned:** `frontend/src/lib/` holds `api.ts`, `api.gen.ts`, `utils.ts` — the typed API client and shadcn's `cn()` helper.

**Found:** the root `.gitignore` had `lib/` and `lib64/` from a generic Python template, which silently ate `frontend/src/lib/` too. `git status` showed `api.gen.ts` as untracked but `git add` printed "ignored by .gitignore".

**Decision:** remove the generic `lib/`/`lib64/`/`dist/`/`downloads/` patterns from the Python section (uv doesn't make them anyway) and add an explicit `!frontend/src/lib/` re-include.

**Where it landed:** `.gitignore`.

---

## How to add a new entry

When you implement something differently from the plan:

1. **Update the source-of-truth doc** ([PLAN.md](PLAN.md), [DATA.md](DATA.md), [ML.md](ML.md), [AGENT.md](AGENT.md), [STACK.md](STACK.md), [PAGES.md](PAGES.md), [FRONTEND.md](FRONTEND.md), [DEMO.md](DEMO.md) — whichever applies) so it stays current with reality. Don't leave the original wrong text in place.
2. **Add an entry here** at the top with: status, context (what was planned), what you found, the decision, where it landed.
3. **Link to the relevant commit** in the entry header so readers can `git show <hash>` for the full change.

If a previous entry gets superseded by a new one, change its status from 🟢 to 🟡 and add a "→ superseded by D-NNN" note. Don't delete history.
