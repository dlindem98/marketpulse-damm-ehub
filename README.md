# Ramp (formerly MarketPulse UK) — Damm × Engineering Hub Hackathon

A tool that forecasts UK sales, detects deviations vs. budget, and recommends commercial actions to close the gap.

## 📚 Docs

- **[CHALLENGE.md](CHALLENGE.md)** — Brief, deliverables, judging criteria
- **[DATA.md](DATA.md)** — Real audit results, ETL, anonymization map, hero SKU decision
- **[ML.md](ML.md)** — Modeling strategy: training plan, ensemble, reconciliation, anomalies, CV
- **[STACK.md](STACK.md)** — Tech stack with rationale, MongoDB collections
- **[AGENT.md](AGENT.md)** — LLM routing (fast Llama / deep Kimi-Instruct / fallback), tools, schemas, ML output caching
- **[PAGES.md](PAGES.md)** — Page-by-page spec (now 4 pages, see D-019)
- **[FRONTEND.md](FRONTEND.md)** — Next.js 16 + App Router build guide, persona-locked IA
- **[PLAN.md](PLAN.md)** — 24h execution plan, role split, risks, done checklist
- **[DEMO.md](DEMO.md)** — 5-min hero narrative + judge Q&A + safety net
- **[DECISIONS.md](DECISIONS.md)** — drift log: every place implementation diverged from the plan and why
- **[Makefile](Makefile)** — every `make <target>` documented (install, data, train, demo, doctor, types, clean)
- **[.env.example](.env.example)** — required env vars (HF_TOKEN; optional Mongo + log level)

## 🎯 One-line pitch

> We don't just forecast sales — we explain *why* the forecast misses budget and tell the commercial team **exactly what to do about it**.

## 🏗️ Architecture at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 frontend (App Router · RSC · Tailwind v4)       │
│  Persona: UK Commercial / Trade Marketing Manager           │
│  Routes: /  →  Triage Inbox                                 │
│          /decision/[sku]/[channel]  →  Diagnose-Options-Sim │
│          /promos  →  Historical ROI library                 │
│          /ask     →  Plain-English Q&A                      │
└────────────────────────┬────────────────────────────────────┘
                         │  REST + SSE (typed via OpenAPI)
┌────────────────────────▼────────────────────────────────────┐
│  FastAPI backend                                            │
│  /forecast · /gap · /drivers · /simulate · /promos/roi      │
│  /recommend · /chat (SSE stream)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Forecast layer  Explanation layer   Recommendation layer
   ─────────────   ──────────────────  ──────────────────────
   MLForecast      SHAP                What-if simulator
   + LightGBM      (deviation          Promo ROI ranking
   StatsForecast   drivers)            smolagents + Llama-3.3
   AutoARIMA       tfcausalimpact      Instructor (3 scenarios)
   Chronos-Bolt    (promo lift)
   (HF Inference)  Anomaly detection
   + hierarchical
   reconciliation
        ▲
        │
        │ Parquet / MongoDB (via MCP)
        │
   ┌────┴─────────────────────────────────────────────────┐
   │  Polars + DuckDB ETL                                 │
   │  + external signals: weather · UK holidays · trends  │
   └──────────────────────────────────────────────────────┘
```

## 🚀 First-time setup (new clone, e.g. teammate)

```bash
git clone https://github.com/GeriMan2004/marketpulse-damm-ehub.git
cd marketpulse-damm-ehub

# 1. Install local tooling
brew install uv pnpm huggingface-cli      # macOS — Linux/Win equivalents apply

# 2. Things you need from your teammate over a private channel:
#    a) HF token with EHubBarcelona org access
#    b) The two Damm Excel files (UK DATA.xlsx, Damm Trade Plan - promotions.xlsx)
cp .env.example backend/.env              # paste HF_TOKEN inside
cp /path/to/Excels/*.xlsx backend/app/data/raw/

# 3. One-shot install + types + sanity check
make first-run

# 4. Run it
make demo                                 # backend :8000  +  web :3000
```

Open <http://localhost:3000>. Backend OpenAPI at <http://localhost:8000/docs>.

### Day-to-day commands

```bash
make demo         backend + Next.js web together
make doctor       check prereqs (HF, uv, pnpm, data, mongo)
make types        regenerate web/ TS types from live backend OpenAPI
make data         run ETL  (raw Excel → snapshots/*.parquet) — Phase 1+
make train        fit forecast ensemble + write snapshots    — Phase 2+
make help         everything else
```

### HF token resolution

The backend resolves the HF token in this order:
1. `HF_TOKEN` env var (from `backend/.env`)
2. `~/.cache/huggingface/token` (set by `hf auth login`)

Either works. `.env` is easier for fresh clones; the cache is fine for single-user dev.

### Data + secrets — what NEVER goes in the repo

- The two `.xlsx` files (confidential per the brief)
- `backend/.env` (HF token)
- Anything under `backend/app/data/raw/`, `backend/app/data/snapshots/`, `backend/app/data/cache/`

All covered by [.gitignore](.gitignore).
