# Frontend — MarketPulse UK (Next.js 16 + App Router)

> **Status:** ✅ Triage inbox + unified decision flow + promo library + chat. Four routes, one persona.
>
> **Persona:** UK Commercial / Trade Marketing Manager. Daily job: prep grocer / pubco calls.
>
> **Stack pivot:** see [DECISIONS.md D-019](DECISIONS.md) for the full rationale. tl;dr — Vite SPA replaced by Next.js 16 RSC; 7-page IA collapsed to 4 task-shaped routes; entry point switched from a dashboard to a triage inbox.

## Information architecture

```
/                                    Triage Inbox (HOME)
/decision/[sku]/[channel]            Unified deep-dive
  ?tab=diagnosis                       Step 1 — what & why
  ?tab=options                         Step 2 — three LLM scenarios
  ?tab=simulate                        Step 3 — what-if controls
/promos                              Promo ROI library
/ask                                 Plain-English Q&A
```

Four routes total. Each one answers ONE question for the Commercial Manager:

| Route | Question it answers | What's on it |
|---|---|---|
| `/` | "What needs my attention this week?" | Ranked worklist (gap chip → SKU → headline → confidence → open) + 3 summary tiles |
| `/decision/...` | "What's wrong with this SKU and what do I do?" | 3-tab flow: forecast+drivers narrative → 3 scenario cards → simulator |
| `/promos` | "What's worked historically?" | Honest ROI table (negative-lift rows shown in red, not hidden) |
| `/ask` | "Quick answer, no chart" | Chat backed by the same LLM the inbox uses |

### Why this is good for the user

**Inbox-as-home, not dashboard-as-home.** A Commercial Manager opens the app
with a job: "which negotiation do I prep for, and what's my ask?" A dashboard
answers "how are we doing." A worklist answers "what should I do." The inbox
is sorted by *absolute gap volume* (Hl, not %), because a 200-Hl miss on a
hero SKU matters more than a 30-Hl miss on a tail SKU even if the % gap is
worse on the tail.

**One SKU = one page.** The old IA scattered each SKU's story across four
routes (forecast → drivers → recommendations → simulator), forcing the user
to manually re-stitch context every navigation. The unified decision page
keeps everything in flow:
- **Step 1 (Diagnosis)** — forecast chart + SHAP drivers + LLM narrative
- **Step 2 (Options)** — 3 scenario cards (conservative / balanced / aggressive)
- **Step 3 (Simulate)** — interactive controls + baseline-vs-simulated chart

Numbered tabs make the flow obvious. URL carries `?tab=…` for deep-linking
(e.g. chat answer can say "look at simulate tab for STAR_24…").

**Honest negative lift.** `/promos` shows negative-lift rows in red. Hiding
them would make the tool untrustworthy — a Commercial Manager can't argue with
a grocer using numbers they suspect are massaged.

**Persona footer.** Sidebar bottom shows "Commercial Manager · UK · Damm" as
a chip — so the audience is unmistakable to anyone in a screen-share demo.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16.2** (App Router, Turbopack default) | Server Components → parallel server-side fetches, no client waterfalls |
| React | **19.2** | Required for App Router + Suspense streaming |
| Styling | **Tailwind CSS v4** (`@theme inline`) | Zero-config; CSS-variable-driven palette |
| Type-safe API client | `openapi-fetch` + `openapi-typescript` (generated from `/openapi.json`) | One source of truth: backend Pydantic → frontend types |
| Client data fetching | **SWR** (for interactive client components only) | Lightweight; matches RSC mental model better than React Query for our shape |
| Charts | **Recharts 3** | MIT, no Plotly CJS interop pain, light bundle |
| Primitives | **Radix UI** (slot, dialog, dropdown, select, slider, tabs, separator) | Headless, accessible, MIT |
| Icons | **lucide-react** | MIT, tree-shakeable |
| Font | **Inter** via `next/font` | Same as Dub / Linear / Vercel; matches modern analytics UIs |

## Design system (Dub-inspired)

All values live in `web/src/app/globals.css` as CSS variables and are wired
into Tailwind via `@theme inline { … }`.

**Light theme (default, no dark mode):**
- `--background: #ffffff`
- `--foreground: #09090b` (zinc-950)
- `--muted: #f4f4f5` (zinc-100), `--muted-foreground: #71717a` (zinc-500)
- `--border: #e4e4e7` (zinc-200)
- `--primary: #18181b` (zinc-900) — buttons, brand chip, active-tab indicator

**Semantic data colors:**
- `--positive: #16a34a` (green-600)
- `--negative: #dc2626` (red-600)
- `--warn: #d97706` (amber-600)
- `--neutral: #71717a` — gaps within ±1%
- Soft variants (`-soft` suffix) for chip backgrounds

**Chart palette:**
- `--chart-1: #3b82f6` (blue-500) — primary forecast line, simulated line
- `--chart-2: #16a34a` — positive bars
- `--chart-3: #dc2626` — negative bars

**Typography:**
- `Inter` everywhere with `font-feature-settings: "rlig" 1, "calt" 1, "ss01" 1, "cv11" 1`
- Tight letter-spacing on headings (`-0.01em`)
- Tabular numerics (`font-variant-numeric: tabular-nums`) on every metric

## File layout

```
web/
├── next.config.ts          rewrites /api/* → http://localhost:8000 in dev
├── src/
│   ├── app/
│   │   ├── layout.tsx              Inter font, Sidebar + Topbar shell
│   │   ├── globals.css             Tailwind v4 + Dub palette
│   │   ├── page.tsx                / — Triage Inbox
│   │   ├── decision/[sku]/[channel]/
│   │   │   ├── page.tsx                  Header + tab orchestration
│   │   │   ├── decision-tabs.tsx         Client tab shell
│   │   │   ├── diagnosis-panel.tsx       Step 1 RSC
│   │   │   ├── options-panel.tsx         Step 2 RSC (calls LLM /api/recommend)
│   │   │   └── simulate-panel.tsx        Step 3 client component (interactive)
│   │   ├── promos/page.tsx
│   │   └── ask/page.tsx
│   ├── components/
│   │   ├── shell/{Sidebar,Topbar}.tsx
│   │   ├── ui/                            shadcn primitives (hand-written)
│   │   └── charts/{ForecastChart,DriversWaterfall,SimulatorChart}.tsx
│   └── lib/
│       ├── api.ts          serverFetch + openapi-fetch client
│       ├── api.gen.ts      generated from backend's /openapi.json
│       ├── format.ts       formatHl / formatPercent / formatGBP / gapColor
│       ├── meta.ts         skuLabel / channelLabel helpers
│       └── utils.ts        cn() merge helper
```

## Data flow

**Server-rendered reads** go through `serverFetch<T>(path)` (in `lib/api.ts`):
- Always `cache: "no-store"` — backend numbers are derived from snapshots
  that may update mid-day; we don't want Next caching stale.
- Direct fetch to `http://localhost:8000` server-side; via `/api/*` rewrite
  in dev for browser-side parity.

**Interactive writes** (simulate, ask) go through `api` from `openapi-fetch`:
- Typed payloads from generated schema
- Browser-side, uses `/api/*` proxy

**Regenerating types after a backend schema change:**
```bash
cd web
pnpm exec openapi-typescript http://localhost:8000/openapi.json -o src/lib/api.gen.ts
```

## Running locally

```bash
# Terminal 1 — backend
cd backend
make dev                    # uvicorn on :8000

# Terminal 2 — frontend
cd web
pnpm install                # one-time
pnpm dev                    # Next.js on :3000 with /api/* → :8000 proxy

# Open http://localhost:3000
```

Env override (optional):
- `API_URL` — server-side base for FastAPI (default `http://localhost:8000`)
- `NEXT_PUBLIC_API_URL` — browser-side base (default `/api`, proxied)

## What we kept from D-018

- Dub-inspired zinc + blue/green/red palette (no more Damm-red brand chrome)
- Inter font, tight letter-spacing, tabular numerics
- Recharts (no more Plotly)
- Semantic gap colors
- Light theme only (no dark-mode toggle)

## What we removed

- 4 separate routes (`/forecast`, `/drivers`, `/recommendations`, `/simulator`) — collapsed into one decision page
- "Overview" dashboard concept — replaced by triage inbox
- StickyFilterBar component — filters live in the URL of the decision page now, not at the global level (a Commercial Manager works one SKU at a time)
- TanStack Query — RSC handles reads; SWR for the one interactive client panel
- React Router — Next App Router handles routing
- Vite — Next dev server (Turbopack)

