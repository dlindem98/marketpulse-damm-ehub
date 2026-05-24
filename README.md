# Ramp / MarketPulse UK

Commercial forecasting demo for the Damm x Engineering Hub hackathon.

The challenge asks for a working tool that uses UK sales history, monthly budget or target estimates, and the promotion plan to forecast sales, detect deviations, explain causes, and recommend commercial actions. In this repo, the source file does not contain a reliable official budget, so the app compares forecasts against a derived `target_hl` estimate. This is documented in [DATA.md](DATA.md).

## What The App Does

- Forecasts monthly SKU x sub-channel hectolitres.
- Provides a weekly view by splitting the monthly forecast into ISO weeks.
- Compares forecast vs target and ranks the biggest commercial gaps.
- Explains forecast drivers with SHAP-style model contributions.
- Shows external context: weather, search trends, ONS retail index, UK holidays, and curated events.
- Includes grocery promotion analysis and promo-aware forecast overlays.
- Recommends actions through an LLM-backed scenario endpoint, with deterministic fallback.
- Generates meeting briefs and market-pulse news context.
- Provides debug endpoints to inspect generated Parquet snapshots.

## What we deliver against the brief

| Brief requirement | Implementation |
|---|---|
| UK sales history | `UK DATA.xlsx` parsed into `wide_monthly.parquet` |
| Monthly budget or target estimate | `targets.parquet`, derived from prior-year actuals / trailing median (no official budget in source — see [DATA.md](DATA.md)) |
| Promotion plan | `Damm Trade Plan - promotions.xlsx` parsed into `promos.parquet` |
| Weekly and/or monthly forecast | Monthly trained forecast; weekly view is a deterministic ISO-week split |
| Forecast vs target dashboard | `/` and `/decision/[sku]/[channel]` |
| Deviations and causes | `/api/gap`, `/api/drivers`, SHAP explanations, external context |
| Promotion impact | `/promos`, `/api/promos/roi`, promo windows for `GROCERY` |
| Commercial recommendations | `/api/recommend` scenarios + `/api/simulate` what-if |
| External sources documented | [DATA.md](DATA.md) |

## Current UI Routes

| Route | Purpose | Main data |
|---|---|---|
| `/login` | Demo auth screen | Frontend only |
| `/` | Commercial inbox / call-prep dashboard | `/api/gap`, `/api/pulse`, aggregates, news |
| `/decision/[sku]/[channel]` | SKU x channel forecast, drivers, external context, recommendations, simulator | `/api/forecast`, `/api/gap`, `/api/drivers`, `/api/external-signals`, `/api/recommend`, `/api/simulate` |
| `/promos` | Historical promotion ROI table | `/api/promos/roi` |
| `/brief` | Customer-call brief workflow | `/api/brief`, local recent-brief state |

There is no frontend page for Parquet browsing at the moment. Use:

- `GET /api/debug/parquet`
- `GET /api/debug/parquet/{name}?limit=100&offset=0&search=...`

## Architecture

```text
UK DATA.xlsx + Damm Trade Plan - promotions.xlsx
        |
        v
Polars ETL + external enrichment
        |
        v
backend/app/data/snapshots/*.parquet
        |
        +--> forecast training pipeline
        |       LightGBM + AutoARIMA/ETS + Chronos + CMBC carve-out
        |       ensemble + reconciliation + calibration + CV + SHAP + anomalies + promo ROI
        |
        v
FastAPI backend
        |
        v
Next.js 16 frontend
```

## Main Tools

Backend:

- FastAPI, Pydantic v2, Uvicorn
- Polars, DuckDB, PyArrow, OpenPyXL, fastexcel
- LightGBM, StatsForecast, Chronos, scikit-learn, scipy, statsmodels
- SHAP for driver explanations
- Hugging Face InferenceClient for LLM routes
- Tavily for optional news refresh

Frontend:

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS v4
- Radix/shadcn-style primitives
- Recharts
- SWR for interactive client panels
- openapi-typescript and openapi-fetch

Dev:

- `uv` for Python
- `pnpm` for web
- `make` targets for install, ETL, training, types, and demo

## Setup

```bash
git clone https://github.com/GeriMan2004/marketpulse-damm-ehub.git
cd marketpulse-damm-ehub

brew install uv pnpm huggingface-cli libomp

cp .env.example backend/.env
# Add HF_TOKEN. Optional: TAVILY_API_KEY for news refresh.

mkdir -p backend/app/data/raw
cp /path/to/UK\ DATA.xlsx backend/app/data/raw/
cp /path/to/Damm\ Trade\ Plan\ -\ promotions.xlsx backend/app/data/raw/

make first-run
make data
make train
make demo
```

Open:

- Frontend: <http://localhost:3000>
- Backend docs: <http://localhost:8000/docs>

## Common Commands

```bash
make demo      # backend on :8000 + frontend on :3000
make backend   # FastAPI only
make web       # Next.js only
make data      # raw Excel -> snapshots
make train     # train all forecast artifacts
make types     # regenerate web/src/lib/api.gen.ts from OpenAPI
make news      # refresh Tavily news cache, requires TAVILY_API_KEY
make doctor    # check local prerequisites
```

## Snapshot Files

Runtime reads generated Parquet files from `backend/app/data/snapshots/`. These are gitignored because they are derived from confidential data.

Important snapshots:

- `wide_monthly.parquet`: cleaned monthly actuals.
- `targets.parquet`: derived target estimates.
- `promos.parquet`: parsed weekly grocery promotion calendar.
- `forecast.parquet`: canonical future forecast.
- `drivers.parquet`: model driver rows for `/api/drivers`.
- `mape.parquet`: rolling CV metrics.
- `calibration.parquet`: interval calibration.
- `promo_roi.parquet`: historical promo ROI table.
- `anomalies.parquet`: historical anomaly flags.

## Confidentiality

Do not commit:

- Raw Excel files.
- `backend/.env`.
- `backend/app/data/raw/`.
- `backend/app/data/snapshots/`.
- `backend/app/data/cache/`.

Customer and retailer names are anonymized before display.

## Docs map

| File | Read it for |
|---|---|
| [README.md](README.md) | What the app does, how to run it, key snapshots, confidentiality (you're here). |
| [DATA.md](DATA.md) | Source Excel layout, ETL, anonymization, external sources, evidence for the +5% event boost. |
| [MODEL.md](MODEL.md) | Training pipeline, ensemble weights, CV accuracy, simulator math, LLM router, known limits. |
