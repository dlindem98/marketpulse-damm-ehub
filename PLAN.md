# Execution Plan — MarketPulse UK

## ✅ Status: Phases 0–3 complete (functional end-to-end)

| Phase | Status | Notes |
|---|---|---|
| 0 — Scaffolding | ✅ done | backend + frontend bootstrapped, all deps installed, `make doctor` green |
| 1 — ETL | ✅ done | 4,244 monthly rows + 7 external columns (NASA POWER, Google Trends, ONS); 1,935 classified promo cells |
| 2 — ML pipeline | ✅ done | `make train` runs all 11 steps in ~29s; 1,068 forecast rows; hierarchy invariants verified |
| 3 — Frontend | ✅ done | 7 pages live: Overview (with Sankey hero), Forecast, Drivers, Promos, Simulator, Recommendations, Chat |
| 4 — Polish & rehearsal | ⏳ next | demo narrative, backup video, fresh-clone validation |

## 🧭 Guiding principle

> **The product is a decision-support assistant, not a dashboard.** Every page maps to one of three questions: *where is the gap*, *why is it there*, *what do we do about it*.
>
> End-to-end ugly > beautiful but incomplete. Always.

## 🎯 Scope locked-in

### Core (must-have, in brief)
1. Weekly + monthly forecast model
2. Forecast vs. budget dashboard with gap detection
3. Promotion impact analysis
4. Actionable recommendations
5. Working demo + repo with run instructions

### High-impact additions (Tier 1, all included)
6. **Hierarchical reconciliation** — SKU → brand → channel → total all add up
7. **Prediction intervals everywhere** — `forecast: 1,200 ± 180 (80% CI)`
8. **Historical anomaly detection** — flag weird past weeks with explanation
9. **What-if promo simulator** — slider page, the killer feature
10. **Promo ROI ranking** — lift × cost, sorted, actionable
11. **"Explain this view" LLM button** — exec summary of current dashboard state
12. **3-scenario recommendations** — conservative / balanced / aggressive
13. **React frontend** — shadcn + Magic UI + Tremor (flat, calm, all MIT)

### Explicitly out of scope
- Custom model fine-tuning
- Marketing Mix Modeling (Robyn / LightweightMMM) unless ahead at H20
- RAG over external market reports
- Multi-agent CrewAI orchestration
- Power BI export
- Auth, multi-tenant, deployment hardening

---

## 🏗️ Repo layout

```
damm-ehub/
  backend/                # FastAPI + ML/LLM Python code
    app/
      main.py             # FastAPI app, CORS, router includes
      routers/
        forecast.py
        gap.py
        drivers.py
        simulate.py
        promos.py
        recommend.py
        chat.py
        meta.py
      services/
        etl.py            # Polars pipeline
        forecast.py       # MLForecast + StatsForecast + Chronos
        hierarchy.py      # hierarchicalforecast
        causal.py         # tfcausalimpact
        explain.py        # SHAP + Alibi
        anomaly.py        # z-score / Merlion
        agent.py          # smolagents + Instructor
      schemas/            # Pydantic models (also reused by Instructor)
      data/
        raw/              # Damm CSVs (gitignored)
        snapshots/        # Parquet pre-baked outputs
    pyproject.toml
    .env.example          # HF_TOKEN, MONGO_URI, etc.

  frontend/               # Vite + React + TS
    src/...               # see FRONTEND.md
    package.json

  README.md
  CHALLENGE.md
  STACK.md
  FRONTEND.md
  PLAN.md
  DEMO.md
```

---

## 👥 Role split (4-person team)

| Role | Owner of | Active hours |
|---|---|---|
| **Data engineer** | ETL, enrichment, Parquet snapshots, anomaly detection | H0–H6, H20+ |
| **ML engineer** | Forecast ensemble, SHAP, causal, hierarchy, simulator | H6–H15 |
| **Backend / LLM engineer** | FastAPI, smolagents, Instructor schemas, SSE chat | H4–H14 (parallel) |
| **Frontend engineer** | React app (see FRONTEND.md H12–H22) | H12–H22 |

Everyone converges H22–H24 on the demo SKU narrative.

---

## ⏰ Hour-by-hour timeline

### H0–H2 · Setup & data understanding (team)
- `make doctor` — verify HF token, uv, pnpm, raw data, mongo (see [Makefile](Makefile))
- Repo: `backend/` + `frontend/`, `uv init` in `backend/`, `pnpm create vite@latest frontend -- --template react-ts`
- Copy both Excel files to `backend/app/data/raw/` (gitignored)
- `cp .env.example backend/.env`, fill `HF_TOKEN`
- Backend engineer: scaffold FastAPI with the 8 endpoints stubbed (Pydantic schemas from [AGENT.md](AGENT.md)) returning mock data. `/docs` live.
- Data engineer: skim the audit numbers in [DATA.md](DATA.md) — **don't re-do the EDA, it's already done**. Validate the audit by loading the file and confirming the row count, customer count, period range.
- Granularity locked: **monthly primary** (`AÑO CALENDARIO`); weekly view = disaggregation for GROCERY only.
- Target: `Hl`. Secondary: `Venta Neta`. Channel filter: `SubChannel` (6 values).
- Hero pinned: **ESTRELLA DAMM × GROCERY** (see [DATA.md §7](DATA.md))
- **Exit:** `make doctor` green; FastAPI returns mock data for all 8 endpoints; FE renders a placeholder Overview page reading from `/api/meta`.

### H2–H6 · ETL + external enrichment (data) · API scaffolding (backend)
**Data engineer:** *(full plan in [DATA.md](DATA.md))*
- Parse `Abr.25`-style periods → month-start dates
- Extract numeric IDs: `Cod. Cliente` → last segment; `Cod. Material` → first token
- Filter `Pais == "Reino Unido"`, expect ~191/219 customers to join, ~25,389/25,714 rows
- **Drop null-Hl rows** — they're accounting noise, not a budget plan (audit finding, see [DECISIONS.md D-008](DECISIONS.md)). 5,487 dropped.
- **Net negative Hl** (returns) per `(cliente, material, month)` before training
- Run anonymization per [DATA.md §5](DATA.md): retailer names → `Grocer A-E`, pubs → `Pubco A-D`, etc. Deterministic via `PYTHONHASHSEED=42`
- **5 bespoke promo parsers** for Tesco / Sainsbury's / Waitrose / Morrisons / Asda (each sheet has a different layout) → one `promos.parquet`. Allocate ~2h to this specifically — it's the hardest ETL.
- External enrichment: `holidays`, Open-Meteo, pytrends, ONS retail index → cached to `data/cache/*.parquet`
- Pandera schema validates the wide monthly frame; channel must be one of the 6 enum values
- Build `wide_monthly.parquet` (primary), `wide_weekly.parquet` (GROCERY only, disaggregated)
- Write `meta.json` (brand/SKU/sub_channel/period lists for filter dropdowns)

**Backend engineer (in parallel):**
- All 8 endpoints stubbed with mock returns
- Pydantic schemas for `Forecast`, `GapItem`, `Driver`, `SimulationRequest/Response`, `PromoROI`, `RecommendationScenario`, `ChatMessage`
- CORS open for `http://localhost:5173`
- `openapi.json` exposed and stable
- **Exit:** frontend can call all 8 endpoints and get well-typed mock data.

### H6–H10 · Forecast engine (ML) · types flowing (frontend prep)
**ML engineer:** *(full spec in [ML.md](ML.md))*
- Global MLForecast + LightGBM (quantile p10/p50/p90) trained across all 471 SKU×SubChannel series with static features (brand, sub_channel, pack, alc%, is_cmbc, months_since_first_sale)
- CMBC carve-out: separate AutoARIMA model on the B2B distributor series, summed back at evaluation
- StatsForecast AutoARIMA baseline at Brand × SubChannel level (82 series)
- Chronos-Bolt zero-shot via HF Inference for cold-start + Moirai-1.1 on GROCERY series (accepts promo plan as covariate). Per-series cache → Parquet
- Ensemble weights: constrained least squares on validation MAPE, **per-SubChannel × horizon**
- Hierarchical reconciliation: `MinTrace(method='mint_shrink')` across SKU → Brand×SubChannel → SubChannel → SalesChannel → Total
- Rolling-origin CV: 3 folds × 3-month horizon on Oct/Nov/Dec 2025; MAPE table written to `snapshots/mape.parquet`
- Anomaly detection: STL residuals + 2.5×MAD on the 82 brand×subchannel series

**Backend engineer:**
- Wire `/api/forecast` and `/api/gap` to the forecast service (returns from `snapshots/forecast.parquet`)
- **Exit:** `GET /api/forecast?sku=EX23SRAN&sub_channel=GROCERY&granularity=month` returns real points with intervals.

### H10–H13 · Analysis layers (ML) · simulator & agent (backend)
**ML engineer:**
- SHAP TreeExplainer on LightGBM → top 3 drivers per gap
- tfcausalimpact on past promos (per promo type × channel) → lift estimates
- Promo ROI table: lift × cost → ranked
- Anomaly detection on history (z-score on rolling residuals)

**Backend / LLM engineer:** *(see [AGENT.md](AGENT.md) for full spec)*
- Pydantic schemas in `backend/app/schemas/` (ForecastSeries, GapItem, Driver, PromoROI, SimulationResult, RecommendationResponse, ExplainViewSummary)
- All 7 smolagents tools implemented (`forecast`, `compare_vs_budget`, `explain_gap`, `simulate_promo`, `rank_promos`, `anomalies`, `meta_lookup`) — wired to `/api/simulate`, `/api/recommend`, etc.
- Alibi counterfactual: minimum feature change to close the gap
- HF `InferenceClient` configured with **two-profile routing**: `fast` = Llama-3.3-70B (Groq, 0.86s) for chat/tools/explain · `deep` = Kimi-K2-Instruct (Novita, 5s) for `/api/recommend` only · `fallback` = Qwen-2.5-72B. `call_with_fallback()` handles 429/5xx automatically. See [AGENT.md](AGENT.md).
- Instructor wrapping enforces `RecommendationResponse` (3-scenario) schema
- `/api/chat` SSE streaming with typed events (`thought` / `tool_call` / `tool_result` / `token` / `done`)
- **Exit:** every backend endpoint returns real, useful data.

### H12–H16 · Frontend foundations (FE) ⟵ starts in parallel with H10–H13
**Frontend engineer:**
- Vite + Tailwind + shadcn + Tremor + theme + sidebar + router shell
- All 7 pages stubbed with skeletons
- `openapi-fetch` typed client wired; TanStack Query providers up
- Overview page rendering real `/api/forecast` + `/api/gap` data
- KPI tiles with Magic UI `NumberTicker`
- **Exit:** Overview page works end-to-end against the backend.

### H16–H20 · Frontend build-out (FE) · ML polish (ML)
**Frontend engineer:** *(see [PAGES.md](PAGES.md) for per-page spec)*
- Forecast detail page with Plotly area + confidence band + anomaly markers
- Drivers page with Plotly SHAP waterfall + Magic UI `TextAnimate` narrative + causal evidence sheet
- Promos page with TanStack Table ROI ranking + per-promo causal detail sheet
- Simulator page with shadcn sliders + Magic UI `ShimmerButton` → re-fetch → new forecast chart, save-as-scenario
- Recommendations page with 3 shadcn cards; LLM-recommended one wrapped in Magic UI `BorderBeam`
- "Explain this view" button (calls `/api/explain-view` with current page+filters+visible state)

**ML engineer (in parallel):**
- Tighten ensemble weights using validation MAPE
- Add anomaly tags to forecast response payload
- Tune prediction-interval calibration

### H20–H22 · Polish + storytelling (team)
- Chat page: Vercel AI SDK `useChat` against `/api/chat` SSE, tool-call breadcrumbs visible
- Verify the hero deep-link reaches every page cleanly: `/forecast?brand=ESTRELLA+DAMM&sub_channel=GROCERY&from=2026-04&to=2026-12`
- Hero is **already pinned** to `ESTRELLA DAMM × GROCERY` — rehearse the narrative from [DEMO.md](DEMO.md)
- Tooltips on every chart, footer with documented external sources
- Fix the 5 worst-looking things in the UI

### H22–H24 · Repo polish + rehearsal (team)
- `make doctor` verifies a fresh clone runs (run on a teammate's machine)
- Document every external source (ONS, Open-Meteo, Google Trends, holidays) in the footer + README
- **Rehearse the demo end-to-end at least 3 times.** Time it; cut anything past 5 min.
- Record a 2-min backup screen capture (`demo/backup.mp4`) — not committed.
- Pre-open both browser tabs on the demo machine. Don't restart live.

---

## 🚨 Risk register

| Risk | Mitigation |
|---|---|
| Novita 429s on Kimi K2-Instruct | `call_with_fallback()` drops to Llama-Groq automatically; pre-bake recommendations to `snapshots/` at H22 |
| Groq 429s on Llama-3.3 (chat) | Falls through to Qwen-2.5 (auto provider); chat has canned fallback dialog |
| Promo ETL is harder than budgeted | 5 bespoke parsers, ~2h dedicated at H2–H4; can ship with 3 retailers if needed (Tesco + Sainsbury's + Asda cover the volume) |
| 21% null Hl + negative Hl rows | Documented handling in [ML.md §0](ML.md) and [DATA.md §3](DATA.md) — split actuals/budget, net returns |
| CMBC dominance distorts the model | Carve-out documented in [ML.md §3](ML.md); separate AutoARIMA series |
| Cold-start SKUs (117 series ≤2 mo) | Global LightGBM + Chronos-Bolt + Moirai ensemble (see [ML.md §3](ML.md)) |
| Hierarchical reconciliation breaks dashboard sums | Assertion in test: `(children.sum() - parent).abs() < 0.001` per node |
| Backend ↔ Frontend type drift | `make types` regenerates from `/openapi.json` after every backend change |
| CORS / SSE issues | Open CORS in dev; test SSE end-to-end at H14, not at H20 |
| Frontend behind schedule | Cut Magic UI extras — keep just `NumberTicker`. Plain shadcn + Tremor still looks great |
| Scope creep on FE | Re-read FRONTEND.md every 4h; the page list is closed at 7 |
| Live demo dies | Backup video + hero deep-link + run `make demo` from a known-good commit |
| Two-process startup confusion at demo | `make demo` starts both with interleaved logs |
| Anonymization drift between runs | `PYTHONHASHSEED=42` enforced in Makefile and .env.example |

---

## 🟢 Done = checklist (matches brief exactly)

- [ ] `make doctor` green on a fresh clone
- [ ] `make demo` starts both servers with no extra steps
- [ ] Demo shows monthly forecast (primary) AND weekly view for GROCERY (disaggregated)
- [ ] Forecast compared against budget — gap KPI on Overview, gap table on `/forecast`
- [ ] Promotions analyzed: causal lift per `(promo_type, channel)`, ROI ranking on `/promos`
- [ ] Tool explains **why** deviations happen — SHAP waterfall + LLM narrative on `/drivers`
- [ ] Demo recommends actions — 3 scenarios on `/recommendations` (conservative/balanced/aggressive)
- [ ] External sources documented in footer + README + DATA.md §5

Plus our edges:
- [ ] Hierarchical reconciliation across SKU → Brand×SubChannel → SubChannel → SalesChannel → Total (assertion test passes)
- [ ] Prediction intervals (p10/p90) on every forecast point, rendered as confidence band
- [ ] What-if promo simulator working live on `/simulator` for GROCERY series
- [ ] Promo ROI ranking with CausalImpact confidence levels
- [ ] "Explain this view" button on every data page
- [ ] Two foundation models integrated: Chronos-Bolt (cold-start) + Moirai-1.1 (GROCERY with covariates)
- [ ] Frontend always uses live backend — no static JSON fallback paths anywhere
- [ ] React frontend with shadcn + Magic UI polish (flat, all MIT)
- [ ] Anonymization stable across runs (`PYTHONHASHSEED=42`)
- [ ] MongoDB scenarios + chat history persisted
- [ ] Backup video recorded
