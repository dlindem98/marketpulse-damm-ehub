# 24h Execution Plan — MarketPulse UK

## 🧭 Guiding principle

> **At hour 12 we must have an ugly-but-complete pipeline end-to-end.** Data → forecast → gap → one recommendation → one rendered React page reading from FastAPI. Then H12–24 we polish each layer.
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
- Repo: `backend/` + `frontend/`, `uv init` in backend, README skeleton
- Backend engineer: `uv add fastapi uvicorn pydantic`; spin up `/api/meta` returning hardcoded data; confirm OpenAPI at `/docs`
- Data engineer: load all Damm CSVs into Polars; one-pass EDA in a marimo notebook
- Decide granularity: **week × SKU × channel**
- Define target column (units vs revenue — confirm)
- **Exit:** typed Polars frames; join keys agreed; FastAPI hello-world live.

### H2–H6 · ETL + external enrichment (data) · API scaffolding (backend)
**Data engineer:**
- Clean + join sales × promo plan × budget into one wide weekly frame
- Features: lags (1, 2, 4, 8, 13, 26, 52w), rolling means/std (4, 13w), UK holidays, Open-Meteo weather, pytrends, ONS retail index
- Pandera validation; snapshot to Parquet
- Push raw + enriched frames into MongoDB via the MCP for live querying

**Backend engineer (in parallel):**
- All 8 endpoints stubbed with mock returns
- Pydantic schemas for `Forecast`, `GapItem`, `Driver`, `SimulationRequest/Response`, `PromoROI`, `RecommendationScenario`, `ChatMessage`
- CORS open for `http://localhost:5173`
- `openapi.json` exposed and stable
- **Exit:** frontend can call all 8 endpoints and get well-typed mock data.

### H6–H10 · Forecast engine (ML) · types flowing (frontend prep)
**ML engineer:**
- MLForecast + LightGBM with all features + exogenous (promos, budget)
- StatsForecast AutoARIMA baseline
- Chronos-Bolt zero-shot via `InferenceClient` per series (with caching to Parquet)
- Ensemble: simple average first, weighted by validation MAPE if time
- Prediction intervals (`level=[80, 95]`)
- 12-week cross-validation → MAPE/SMAPE table
- Hierarchical reconciliation (MinTrace) across SKU → brand → channel → total

**Backend engineer:**
- Wire `/api/forecast` and `/api/gap` to the real forecast service
- **Exit:** `GET /api/forecast?sku=X&channel=Y&horizon=8` returns real numbers with intervals.

### H10–H13 · Analysis layers (ML) · simulator & agent (backend)
**ML engineer:**
- SHAP TreeExplainer on LightGBM → top 3 drivers per gap
- tfcausalimpact on past promos (per promo type × channel) → lift estimates
- Promo ROI table: lift × cost → ranked
- Anomaly detection on history (z-score on rolling residuals)

**Backend / LLM engineer:**
- `simulate_promo(sku, channel, weeks, discount_pct)` function — wired to `/api/simulate`
- Alibi counterfactual: minimum feature change to close the gap
- smolagents agent with tools: `forecast`, `compare_vs_budget`, `explain_gap`, `simulate_promo`, `rank_promos`
- Instructor schema for 3 scenarios (conservative / balanced / aggressive) — wired to `/api/recommend`
- `/api/chat` SSE streaming from smolagents
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
**Frontend engineer:**
- Forecast detail page with Plotly area + confidence band
- Drivers page with Plotly SHAP waterfall + Magic UI `TextAnimate` narrative
- Promos page with causal charts + TanStack Table ROI ranking
- Simulator page with shadcn sliders + Magic UI `ShimmerButton` → re-fetch → new forecast chart
- Recommendations page with 3 shadcn cards; recommended one wrapped in Magic UI `BorderBeam`
- "Explain this view" button (calls `/api/recommend` with current page context)

**ML engineer (in parallel):**
- Tighten ensemble weights using validation MAPE
- Add anomaly tags to forecast response payload
- Tune prediction-interval calibration

### H20–H22 · Polish + storytelling (team)
- Chat page: Vercel AI SDK `useChat` against `/api/chat` SSE, tool-call breadcrumbs visible
- Pre-compute forecast + recommendations into Parquet/Mongo so the demo doesn't depend on live HF calls (except chat)
- Choose **one hero SKU** for the live narrative (see [DEMO.md](DEMO.md))
- Hidden `⌘ + .` shortcut to swap between live and snapshot modes
- Add tooltips: every chart has a one-liner explaining what it shows
- Add a footer with documented data sources (checklist item)
- Fix the 5 worst-looking things in the UI

### H22–H24 · Repo polish + rehearsal (team)
- `README.md` run instructions: `uv sync` → `uvicorn`, `pnpm install` → `pnpm dev`
- `.env.example` for HF token + Mongo URI
- Document every external source (ONS, Open-Meteo, Google Trends, holidays)
- **Rehearse the demo end-to-end at least 3 times.** Time it; cut anything past 5 min.
- Record a 2-min backup screen capture in case live demo breaks.

---

## 🚨 Risk register

| Risk | Mitigation |
|---|---|
| HF Inference slow / rate-limited | Cache to Parquet; AutoARIMA fallback; pre-bake demo data |
| Data dirtier than expected | Don't optimize before H6; allocate slack |
| Backend ↔ Frontend type drift | `openapi-fetch` regenerates types from `/openapi.json` after every backend change |
| CORS / SSE issues | Open CORS in dev, locked in demo; test SSE early at H14 |
| Frontend behind schedule | Cut Magic UI extras (BorderBeam, ShimmerButton, Marquee) — keep just NumberTicker. Plain shadcn + Tremor still looks great |
| Streamlit-style scope creep on FE | Re-read FRONTEND.md every 4h |
| Live demo dies | Backup video + snapshot mode + hero SKU pre-baked |
| Two-process startup confusion at demo | One `make demo` script that starts both with logs |

---

## 🟢 Done = checklist (matches brief exactly)

- [ ] Repository includes clear run instructions
- [ ] Demo shows weekly **and** monthly forecast
- [ ] Solution compares forecast against budget or target
- [ ] Solution includes promotions in the analysis
- [ ] Tool explains **why** deviations happen (SHAP + LLM narrative)
- [ ] Demo recommends actions to move closer to target (3 scenarios)
- [ ] External sources used are documented (footer + README)

Plus our edges:
- [ ] Hierarchical reconciliation across SKU → brand → channel → total
- [ ] Prediction intervals on every forecast
- [ ] What-if promo simulator working live
- [ ] Promo ROI ranking
- [ ] LLM exec-summary button on every page
- [ ] Foundation-model forecast (Chronos-Bolt) integrated
- [ ] React frontend with shadcn + Magic UI polish (flat, all MIT)
