# Tech Stack — MarketPulse UK

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

## 8. Frontend (React)

See **[FRONTEND.md](FRONTEND.md)** for the detailed component map. Highlights:

- ⭐ **[Vite](https://vitejs.dev/) + React 18 + TypeScript** — fastest dev loop. (Next.js 15 alternative if SSR matters.)
- ⭐ **[Tailwind CSS](https://tailwindcss.com/)** — required by every UI lib below.
- ⭐ **[shadcn/ui](https://ui.shadcn.com/)** — copy-paste components, no dep hell. Cards, Tabs, Slider, Sheet, Command, DropdownMenu, Sonner.
- ⭐ **[Magic UI](https://magicui.design/)** (MIT) — free shadcn-style animated components, all flat / 2D: `NumberTicker`, `TextAnimate`, `Marquee`, `ShimmerButton`, `BorderBeam`, `MagicCard` (spotlight hover, no tilt), `AnimatedGradientText`. Installed via shadcn CLI.
- ⭐ **[Tremor](https://tremor.so/)** — dashboard primitives built on Recharts + Tailwind. `<Card>`, `<Metric>`, `<BadgeDelta>`, `<AreaChart>`, `<BarList>`, `<DonutChart>`. Massive time saver.
- ⭐ **[Recharts](https://recharts.org/)** (under Tremor) for default charts; **[Plotly.js](https://plotly.com/javascript/)** when we need SHAP waterfalls or confidence-band shading Tremor can't do.
- ⭐ **[TanStack Query](https://tanstack.com/query)** — server-state caching for all `/api/*` calls.
- ⭐ **[TanStack Table](https://tanstack.com/table)** — gap table, promo ROI table.
- ⭐ **[Vercel AI SDK `useChat`](https://sdk.vercel.ai/docs)** or **[assistant-ui](https://github.com/Yonom/assistant-ui)** — streaming chat UI hooked to `/api/chat`.
- ⭐ **[Lucide React](https://lucide.dev/)** — icons.
- ⭐ **[Framer Motion](https://www.framer.com/motion/)** — already a peer of React Bits; powers page transitions and micro-interactions.
- ⭐ **[next-themes / class-based dark mode](https://github.com/pacocoursey/next-themes)** — dark theme default, Damm red accent.
- ⭐ **[openapi-fetch](https://github.com/openapi-ts/openapi-typescript)** — generates typed client from FastAPI's OpenAPI; zero hand-written DTOs.

---

## 9. Storage

- ⭐ **Parquet on disk** — raw data + pre-computed forecast snapshots (demo determinism).
- ⭐ **MongoDB** (via the MongoDB MCP) — live demo state: forecasts, recommendations, chat history. Lets Claude query state directly during development.

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
Repo layout    : backend/  +  frontend/  (monorepo, no workspace needed)

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

Frontend       : Vite + React 18 + TypeScript + Tailwind
                 + shadcn/ui (primitives)
                 + Magic UI (NumberTicker, TextAnimate, MagicCard,
                             BorderBeam, ShimmerButton, Marquee — MIT, all flat)
                 + Tremor (dashboard cards + charts)
                 + Plotly.js (SHAP + confidence bands)
                 + TanStack Query + TanStack Table
                 + Vercel AI SDK useChat (streaming chat)
                 + Framer Motion (subtle page transitions)
                 + openapi-fetch (typed API client)

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
8. **React + shadcn + Magic UI + Tremor** gives a Linear/Vercel-quality UI in a fraction of the time of building from scratch — all MIT-licensed, safe for a public repo, flat aesthetic that doesn't fight a data dashboard.
9. **MongoDB MCP** lets Claude query state during development without writing glue code.
