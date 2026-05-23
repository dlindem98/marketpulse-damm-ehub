# Tech Stack — Ramp

Every choice has a reason tied to a judging criterion. ⭐ = primary pick.

---

## 1. Data ingestion & wrangling

- ⭐ **[Polars](https://github.com/pola-rs/polars)** — 5–30× faster than pandas, lazy API, handles SKU × channel × week joins effortlessly.
- ⭐ **[DuckDB](https://github.com/duckdb/duckdb)** — SQL on Parquet in-process; can query Polars frames directly.
- ⭐ **[pandera](https://github.com/unionai-oss/pandera)** — schema validation, one extra slide for the "data cleaning" criterion.

---

## 2. Forecasting

### Classical / ML
- ⭐ **[Nixtla MLForecast](https://github.com/Nixtla/mlforecast)** — wraps LightGBM as a forecaster, auto lags/rolling features, exogenous vars (promos, budget), probabilistic out of the box.
- ⭐ **[Nixtla StatsForecast](https://github.com/Nixtla/statsforecast)** — AutoARIMA / ETS / Theta in C; sanity baseline per SKU.

### Foundation models (zero-shot via HF Inference)
- ⭐ **[amazon/chronos-bolt-base](https://huggingface.co/amazon/chronos-bolt-base)** — Amazon's TS foundation model, near-SOTA zero-shot.
- Fallbacks: `google/timesfm-2.0-500m-pytorch`, `Salesforce/moirai-1.1-R-large`.

### Hierarchical reconciliation
- ⭐ **[hierarchicalforecast (Nixtla)](https://github.com/Nixtla/hierarchicalforecast)** — SKU → brand → channel → total all add up. MinTrace method.

---

## 3. Promotion impact & causal analysis

- ⭐ **[tfcausalimpact](https://github.com/WillianFuks/tfcausalimpact)** — Google's CausalImpact, per-promo lift vs counterfactual.
- Optional: LightweightMMM for budget allocation (only if H20+ ahead of schedule).

---

## 4. Explainability

- ⭐ **[SHAP](https://github.com/shap/shap)** — TreeExplainer on LightGBM → instant deviation drivers (waterfall plot).
- ⭐ **[Alibi](https://github.com/SeldonIO/alibi)** — counterfactual explanations ("if promo budget were 10% higher, sales would be X").

---

## 5. LLM / agent layer (HF Inference)

- ⭐ **[huggingface_hub InferenceClient](https://huggingface.co/docs/huggingface_hub/guides/inference)** — native HF client, OpenAI-compatible.
- ⭐ **[smolagents](https://github.com/huggingface/smolagents)** — lightweight HF agent. Tools: `forecast()`, `simulate_promo()`, `compare_vs_budget()`, `recommend()`.
- ⭐ **[Instructor](https://github.com/jxnl/instructor)** — Pydantic-typed LLM outputs → reliable structured recommendations (the 3 scenarios).
- ⭐ Two-profile routing (live-benchmarked from EHubBarcelona org token):
  - **`fast`** = `meta-llama/Llama-3.3-70B-Instruct` via **Groq** (0.86s) → chat, tool-call loops, explain-view
  - **`deep`** = `moonshotai/Kimi-K2-Instruct` via **Novita** (5.0s, very specific CPG outputs) → `/api/recommend` only
  - **`fallback`** = `Qwen/Qwen2.5-72B-Instruct` (auto, 2.4s) on any 5xx/429
  - `call_with_fallback()` helper handles failover automatically — see [AGENT.md](AGENT.md).
  - **Kimi K2.6 (thinking variant) is explicitly NOT used** — outputs `reasoning_content` instead of `content`, 16s+ with empty finals, wrong for live demo.

---

## 6. External UK data sources (free)

| Source | What we get | Library |
|---|---|---|
| UK Gov bank holidays | Holidays as feature | `holidays` pkg |
| Open-Meteo | Weather (critical for beer) | `requests` |
| Google Trends | Brand & competitor search interest | `pytrends` |
| ONS API | UK retail sales index, inflation | `requests` |
| FRED | Macro indicators (optional) | `fredapi` |

---

## 7. Backend API

- ⭐ **[FastAPI](https://github.com/tiangolo/fastapi)** — async, auto OpenAPI, Pydantic-native. Keeps every ML/LLM call in Python.
- ⭐ **[Pydantic v2](https://docs.pydantic.dev/)** — request/response schemas; double-duty as Instructor schemas for the LLM.
- ⭐ **[Uvicorn](https://www.uvicorn.org/)** — ASGI server.
- ⭐ **SSE streaming** (FastAPI `StreamingResponse`) for the chat agent.
- ⭐ **[CORS middleware](https://fastapi.tiangolo.com/tutorial/cors/)** — open in dev, locked-down for demo.
- Optional: **[fastapi-cache](https://github.com/long2ice/fastapi-cache)** + in-memory backend for forecast caching during demo.

### Endpoints (8)

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/forecast` | Forecast + intervals by SKU/channel/horizon |
| `GET` | `/api/gap` | Budget vs forecast deviation table |
| `GET` | `/api/drivers` | SHAP top features for a selection |
| `POST` | `/api/simulate` | What-if re-forecast |
| `GET` | `/api/promos/roi` | Ranked promo ROI table |
| `POST` | `/api/recommend` | 3-scenario LLM recommendation (Instructor) |
| `POST` | `/api/chat` | SSE stream from smolagents |
| `GET` | `/api/meta` | Brands, SKUs, channels, date ranges (for filters) |

---

## 8. Frontend (Next.js)

See **[FRONTEND.md](FRONTEND.md)** for the detailed component map and IA. Highlights:

- ⭐ **[Next.js 16](https://nextjs.org/) (App Router) + React 19 + TypeScript** — Server Components for parallel server-side fetches, Suspense streaming for slow LLM calls, no client-side fetch waterfalls. Turbopack is the default bundler.
- ⭐ **[Tailwind CSS v4](https://tailwindcss.com/)** with the new `@theme inline` directive — zero PostCSS config.
- ⭐ **shadcn/ui primitives** — hand-written into `web/src/components/ui/` (button, card, tabs, select, slider, dropdown-menu, badge, skeleton, separator, input). Built on Radix UI.
- ⭐ **[Radix UI](https://www.radix-ui.com/)** — headless accessible primitives (slot, dialog, dropdown-menu, select, slider, tabs, separator).
- ⭐ **[Recharts 3](https://recharts.org/)** — MIT, light bundle. Forecast area+line, drivers waterfall, simulator chart.
- ⭐ **[SWR](https://swr.vercel.app/)** — only used inside the interactive Simulate panel; RSC handles all read paths.
- ⭐ **[Lucide React](https://lucide.dev/)** — icons.
- ⭐ **Inter via `next/font/google`** — same family as Dub / Linear / Vercel; tabular numerics on every metric.
- ⭐ **[openapi-fetch](https://github.com/openapi-ts/openapi-typescript) + openapi-typescript** — generates typed client from FastAPI's OpenAPI. Regenerate with `make types`.

---

## 9. Storage

- ⭐ **Parquet on disk** — raw data + pre-computed forecast snapshots. See [DATA.md §6](DATA.md) for the snapshot file list.
- ⭐ **MongoDB** (via the MongoDB MCP) — live demo state. Collections + indexes below.

### MongoDB collections (database = `marketpulse`)

| Collection | Document shape | Written by | Read by |
|---|---|---|---|
| `scenarios` | `{_id, sku, sub_channel, period, request: SimulationRequest, result: SimulationResult, created_at, source: "simulator"\|"agent"}` | `/api/simulate` save-as | `/api/scenarios`, `/recommendations` custom list |
| `recommendations` | `{_id, sku, sub_channel, period, response: RecommendationResponse, model_used, latency_ms, created_at}` | `/api/recommend` | `/recommendations` (caches latest per key) |
| `chat_sessions` | `{_id, session_id, messages: [{role, content, tool_calls:[…], created_at}], created_at, updated_at}` | `/api/chat` | `/chat` (history survives reload) |
| `meta_cache` | `{_id:"filters", brands, skus, sub_channels, period_range, refreshed_at}` | `/api/meta` (cold start) | every page topbar |
| `explain_view` | `{_id, page, filters_hash, summary: ExplainViewSummary, created_at}` | `/api/explain-view` | "Explain this view" sheet (60s cache per visible state) |

Indexes:
- `scenarios` → `{sku:1, sub_channel:1, period:1, created_at:-1}`
- `recommendations` → unique `{sku:1, sub_channel:1, period:1}`
- `chat_sessions` → `{session_id:1, updated_at:-1}`

The MongoDB MCP gives Claude direct query access during development — verify saves without writing throwaway scripts.

---

## 10. Dev experience

- ⭐ **[uv](https://github.com/astral-sh/uv)** — Python envs, 10× faster than pip.
- ⭐ **[pnpm](https://pnpm.io/)** — JS package manager, fast + disk-efficient.
- ⭐ **[ruff](https://github.com/astral-sh/ruff)** — Python lint+format.
- ⭐ **[biome](https://biomejs.dev/)** or **eslint + prettier** — JS/TS lint+format.
- Optional: **marimo** for EDA, **MLflow** for experiment logs.

---

## 🧩 Final stack (concrete picks)

```
Repo layout    : backend/  +  web/  (monorepo, no workspace needed)

Data           : Polars + DuckDB + Pandera
External       : holidays + Open-Meteo + pytrends + ONS
Forecasting    : MLForecast(LightGBM) + StatsForecast(AutoARIMA)
                 + Chronos-Bolt zero-shot via HF Inference
                 + hierarchicalforecast (reconciliation)
                 + prediction intervals everywhere
Causal         : tfcausalimpact (per-promo lift)
Explainable    : SHAP (deviation drivers) + Alibi (counterfactuals)
                 + anomaly detection on history (z-score / Merlion)
LLM layer      : HF InferenceClient — two-profile routing
                   fast  = Llama-3.3-70B (Groq, 0.86s)  → chat, tools, explain
                   deep  = Kimi-K2-Instruct (Novita, 5s) → /api/recommend only
                   fb    = Qwen-2.5-72B (auto)          → 429/5xx fallback
                 + smolagents (forecast/simulate_promo/compare_budget tools)
                 + Instructor (3-scenario structured recommendations on `deep`)
                 → full design + benchmarks in AGENT.md
Storage        : Parquet (raw + snapshots) + MongoDB (live state via MCP)

Backend        : FastAPI + Pydantic v2 + Uvicorn + SSE for chat
                 + openapi.json published → typed FE client

Frontend       : Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
                 + shadcn primitives (hand-written, MIT-clean)
                 + Radix UI (headless accessible)
                 + Recharts 3 (forecast / waterfall / simulator)
                 + SWR (interactive client panels only)
                 + Lucide React (icons)
                 + Inter via next/font (tabular numerics on metrics)
                 + openapi-fetch + openapi-typescript (typed API client)

Dev            : uv + pnpm + ruff + biome
```

## Why this exact combo

1. **MLForecast + LightGBM** handles the tabular sales-with-covariates structure far better than pure Prophet/ARIMA.
2. **Chronos-Bolt via HF Inference** = zero-shot baseline, no GPU. Rescues short-history SKUs and is a credibility lever in the demo.
3. **Hierarchical reconciliation** makes the forecast usable as a business plan — CPG judges recognize this immediately.
4. **tfcausalimpact** delivers the promotion analysis checklist item in <50 LOC.
5. **SHAP + Alibi** map directly to *explain deviations* and *recommend actions* scoring criteria.
6. **Two-profile LLM routing** = best of both worlds. Llama-3.3 via Groq (0.86s) for everything latency-sensitive — chat, tool-call loops, explain-view. Kimi-K2-Instruct via Novita (5s) only on the `/api/recommend` endpoint, where output quality is judged on "actionability" and the user expects a moment of thinking. Live benchmark, not a guess.
7. **FastAPI** keeps every Python ML call intact while exposing a clean typed REST surface.
8. **Next.js 16 + Radix + Recharts** gives a Linear/Dub-quality UI with RSC parallel fetches and Suspense streaming — all MIT-licensed, safe for a public repo, no client-side fetch waterfalls.
9. **MongoDB MCP** lets Claude query state during development without writing glue code.
