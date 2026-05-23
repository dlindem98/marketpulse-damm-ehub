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

---

## 🌍 External data sources

The brief explicitly values *"cleaning, integration and enrichment of Damm
data with relevant external sources"*. The forecast model consumes the
following non-Damm signals; each gets a documented column in
`backend/app/data/snapshots/wide_monthly.parquet` and a surfaced reading in
the UI's `External context` panel on the Decision page.

| Source | Endpoint / method | Auth | Resolution | Columns produced | Where it shows up in the UI |
|---|---|---|---|---|---|
| **NASA POWER** (weather) | HTTPS, `power.larc.nasa.gov` API | None | Monthly mean | `temp_c_mean`, `temp_c_anomaly` (signed vs 30-year climatology) | Decision → External context → Weather row |
| **Google Trends** (search interest) | `pytrends` polite scraper | None | Monthly aggregate (0-100 normalized) | `trends_estrella`, `trends_lager`, `trends_beer` | Decision → External context → Search interest pills |
| **ONS Retail Index** | UK Office for National Statistics JSON | None | Monthly | `ons_retail_index`, `ons_food_drink_index` | Decision → External context → UK food & drink retail row |
| **UK Bank Holidays** | `holidays` PyPI package | None | Daily | Snapped to month for chart annotation | Forecast chart vertical markers (hover for label); Decision → External context → "In this month" chips |
| **Sport / cultural fixtures** | Curated in `backend/app/services/calendar.py` (World Cup, Wimbledon, Boxing Day football, Euros) | n/a | Date-anchored | Snapped to month | Same as above |
| **Tavily news** (commercial context) | `api.tavily.com` (API key, optional — feature degrades cleanly if absent) | `TAVILY_API_KEY` | On-demand | Cached at `data/cache/news/articles.json` | Left sidebar "News" feed |

**ETL flow**: external pulls run inside `make data` via `backend/app/services/external.py` and are joined onto the monthly Damm sales panel by date. Cached responses live under `backend/app/data/cache/`. Re-running the ETL refreshes them.

**Why monthly**: every external feed in the table above publishes monthly or coarser. When weekly Damm data lands, weekly weather (NASA POWER supports daily) and weekly trends can drop in without reshaping the join.

**What happens for forecast months without actuals**: external readings only exist for months we have in `wide_monthly.parquet`. For forward-looking forecast months (May 2026 → Jan 2027), the `/api/external-signals` endpoint substitutes the **same calendar month a year back** as a seasonal proxy and flags the source as `prior_year` so the UI can disclose it (small "Same month a year back" note).

## 💷 Gross price per hL (the "normal" price)

Per the hackathon coordinator's clarification, teams can approximate the
beer's "normal" price (pre-discount, pre-promo) by dividing total sales
by hectolitres sold on any slice of the data. We do that and surface the
result everywhere the UI shows a gap, so a `-10.7k hL` shortfall reads as
`≈ -£2.3M` next to it — the language commercial leadership negotiates in.

### Method

```
gross_price_per_hL  =  Σ revenue  /  Σ Hl
```

Computed at multiple granularities by [`backend/app/services/pricing.py`](backend/app/services/pricing.py):

| Granularity | Used by |
|---|---|
| **Portfolio** (UK-wide) | `/api/pulse` headline £ impact |
| **Brand** | `/api/forecast/by-brand` chip `gap_gbp` field |
| **Sub-channel** | `/api/forecast/by-sub-channel` chip `gap_gbp` field |
| **SKU × sub-channel** | `/api/gap` row `gap_gbp` field |
| **Arbitrary filter** | `/api/pricing/gross-per-hl?sku=…&brand=…&sub_channel=…&from=…&to=…` |

### Caveats — disclosed in the UI and in the endpoint response

1. **Net vs gross**: the source column `revenue_gbp` is mapped from `Venta Neta` (Net Sales) — i.e. post-discount. At the aggregate level (many promo + non-promo months averaged together) the resulting £/hL is still a reasonable proxy for the SKU's base unit value. We surface the `≈` symbol everywhere and the API response includes a `note` field stating this explicitly.
2. **Unit scale**: source figures land at ~£0.22 per hL raw, which only makes sense if they're in **thousands** (UK wholesale lager is £150-300/hL). We multiply by `REVENUE_SCALE_TO_GBP = 1000` (constant in `pricing.py`). The resulting Estrella Damm rate of ~£222/hL matches typical UK off-trade lager pricing. If the ETL is corrected upstream, flip the constant.
3. **Missing slices**: when a filter matches zero historical rows (e.g. brand-new SKU), `gap_gbp` returns `null` and the UI silently omits the £ readout rather than guessing.

## 📅 Forecast granularity

| Granularity | Source | Note |
|---|---|---|
| **Monthly** | LightGBM quantile ensemble trained on `wide_monthly.parquet`. Output → `forecast.parquet`. | Primary, used everywhere. |
| **Weekly** | Derived from the monthly forecast by pro-rating each ISO week's share by the days it has inside the month (see `backend/app/services/weekly_split.py`). Sum within a month equals the monthly point by construction. | Honest derivation, not a separately-trained model. Real weekly model will slot in behind the same endpoint when weekly data is wired through the ETL. |

The brief's checklist asks for "weekly **or** monthly" — both are available behind `/api/forecast?granularity=week|month`; the Decision-view chart toggle drives it.

All covered by [.gitignore](.gitignore).
