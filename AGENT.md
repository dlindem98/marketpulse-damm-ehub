# Agentic Layer — design spec

The LLM/agent layer is what turns numeric output into *commercial recommendations a director can act on*. This doc defines the model, tools, schemas, prompts, and streaming contract.

---

## 🤖 Models (HF Inference Providers)

**Two-model routing — speed where it matters, depth where it counts.** Live-benchmarked from the EHubBarcelona org token (see commit history for the numbers).

| Profile | Model | Provider | Latency | Used for |
|---|---|---|---|---|
| **`fast`** | `meta-llama/Llama-3.3-70B-Instruct` | Groq | **0.86s** ⚡ | `/api/chat`, `/api/explain-view`, all smolagents tool-call loops |
| **`deep`** | `moonshotai/Kimi-K2-Instruct` | Novita | 5.0s | `/api/recommend` only — the 3-scenario money endpoint |
| **`fallback`** | `Qwen/Qwen2.5-72B-Instruct` | auto | 2.4s | Any 5xx / 429 / timeout |
| Embeddings *(if RAG added later)* | `BAAI/bge-m3` | HF | — | Multilingual SOTA |

### Why this split

- **Sub-second latency is non-negotiable** for the live agent chat. Groq makes a 4-tool-call loop feel like one round-trip (~3s) instead of a coffee break (~20s with a deep model).
- **`/api/recommend` is the screen judges score "actionability" on** — the single criterion most explicitly named in the brief. Kimi K2-Instruct outputs use real CPG vocabulary ("off-invoice promotion", "in-aisle barkers", "incremental display"), specific budgets, and conditional structures. 4s extra on the highest-stakes screen is the best trade in the stack.
- **Kimi K2.6 (thinking variant) is explicitly NOT used** — it spends tokens on `reasoning_content`, takes 16s+ to produce any content, and routinely cuts off at `finish_reason: length` with 0 chars of actual answer. Save thinking models for offline tasks.

### Code

```python
from huggingface_hub import InferenceClient
from huggingface_hub.utils import HfHubHTTPError
import os

MODELS = {
    "fast":     ("meta-llama/Llama-3.3-70B-Instruct", "groq"),
    "deep":     ("moonshotai/Kimi-K2-Instruct",       "novita"),
    "fallback": ("Qwen/Qwen2.5-72B-Instruct",         None),
}

def get_client(profile: str = "fast") -> InferenceClient:
    model, provider = MODELS[profile]
    kw = {"model": model, "token": os.environ["HF_TOKEN"]}
    if provider:
        kw["provider"] = provider
    return InferenceClient(**kw)

def call_with_fallback(profile: str, **chat_kwargs):
    """Try the chosen profile; on provider error fall through Llama→Qwen."""
    chain = [profile, "fast", "fallback"]
    # dedupe while preserving order
    chain = list(dict.fromkeys(chain))
    last_err = None
    for p in chain:
        try:
            return get_client(p).chat_completion(**chat_kwargs)
        except (HfHubHTTPError, TimeoutError) as e:
            last_err = e
            continue
    raise last_err
```

### Usage map

```python
# /api/chat  (smolagents loop)
resp = call_with_fallback("fast", messages=msgs, max_tokens=512)

# /api/explain-view
resp = call_with_fallback("fast", messages=msgs, max_tokens=300)

# /api/recommend  (3-scenario, via Instructor)
resp = call_with_fallback("deep", messages=msgs, max_tokens=800, response_format=...)
```

---

## 🧰 Tool catalog (smolagents)

Tools are plain Python functions decorated with `@tool`. smolagents passes the docstring as the tool description to the model. Keep docstrings tight — they go into the system prompt.

```python
from smolagents import tool
from app.schemas import (
    ForecastSeries, GapItem, Driver, PromoROI,
    SimulationResult, AnomalyEvent,
)

@tool
def forecast(sku: str, channel: str, horizon_months: int = 3) -> ForecastSeries:
    """Forecast Hl volume for a SKU on a channel over the next N months.
    Returns point forecast plus 80% and 95% prediction intervals."""

@tool
def compare_vs_budget(sku: str, channel: str, period: str) -> GapItem:
    """Return forecast vs budget for a SKU/channel in a given month (e.g. 'Nov.26').
    Includes absolute gap (Hl) and gap %."""

@tool
def explain_gap(sku: str, channel: str, period: str, top_k: int = 3) -> list[Driver]:
    """Return the top-K SHAP-based drivers of the gap for a SKU/channel/period."""

@tool
def simulate_promo(
    sku: str,
    channel: str,
    months: list[str],
    discount_pct: float,
    promo_type: str = "multi-pack",
) -> SimulationResult:
    """Re-run the forecast assuming a promo with given discount and type runs in
    the given months. Returns the new forecast, the new gap, and gap_closed_pct."""

@tool
def rank_promos(channel: str | None = None, top_k: int = 10) -> list[PromoROI]:
    """Rank historical promotions by ROI (causal lift × revenue per Hl - promo cost).
    Filter by channel if provided. Highest ROI first."""

@tool
def anomalies(sku: str, channel: str, lookback_months: int = 12) -> list[AnomalyEvent]:
    """Detect anomalies (|z| > 2) in past sales for a SKU/channel.
    Each event has period, z-score, and a candidate cause from feature deltas."""

@tool
def meta_lookup(kind: str) -> list[str]:
    """List available values for a metadata field: 'brand', 'sku', 'channel',
    'subchannel', 'period'. Used by the agent to ground SKU/channel names."""
```

Every tool returns a **Pydantic model**, never a free-form string. The agent therefore sees typed JSON and can chain calls without parsing.

---

## 📦 Pydantic schemas

All schemas live in `backend/app/schemas/` and are reused as:
1. FastAPI request/response models (auto-published in `/openapi.json`)
2. Instructor schemas for the LLM (structured output)
3. TypeScript types on the frontend (via `openapi-typescript`)

```python
# schemas/forecast.py
from pydantic import BaseModel, Field
from datetime import date

class ForecastPoint(BaseModel):
    period: str              # "Nov.26"
    period_start: date
    point: float             # Hl
    lo80: float
    hi80: float
    lo95: float
    hi95: float
    is_actual: bool = False  # true for historical months

class ForecastSeries(BaseModel):
    sku: str
    channel: str
    granularity: str = Field(pattern="^(month|week)$")
    points: list[ForecastPoint]


# schemas/gap.py
class GapItem(BaseModel):
    sku: str
    channel: str
    period: str
    forecast_hl: float
    budget_hl: float
    gap_hl: float          # forecast - budget
    gap_pct: float         # gap_hl / budget_hl
    confidence: str = Field(pattern="^(low|medium|high)$")


# schemas/drivers.py
class Driver(BaseModel):
    feature: str           # human label, e.g. "Promo coverage weeks 46-47"
    shap_value: float      # signed contribution in Hl
    direction: str = Field(pattern="^(positive|negative)$")
    explanation: str       # one-sentence natural-language explanation


# schemas/promos.py
class PromoROI(BaseModel):
    promo_type: str        # e.g. "Multi-pack 4x330ml"
    channel: str
    avg_lift_pct: float    # from CausalImpact
    avg_lift_hl: float
    estimated_cost: float | None
    roi: float | None      # null if cost unknown
    n_observations: int
    confidence: str = Field(pattern="^(low|medium|high)$")


# schemas/simulation.py
class SimulationRequest(BaseModel):
    sku: str
    channel: str
    months: list[str]
    discount_pct: float = Field(ge=0, le=100)
    promo_type: str = "multi-pack"

class SimulationResult(BaseModel):
    baseline: ForecastSeries
    simulated: ForecastSeries
    gap_before_hl: float
    gap_after_hl: float
    gap_closed_pct: float
    estimated_cost: float | None
    notes: str             # short LLM-generated rationale


# schemas/anomaly.py
class AnomalyEvent(BaseModel):
    sku: str
    channel: str
    period: str
    actual_hl: float
    expected_hl: float
    z_score: float
    candidate_cause: str   # e.g. "Weather: temp -3.2°C vs. typical"


# schemas/recommendation.py — THE money schema
class RecommendationAction(BaseModel):
    action: str            # short imperative: "Extend multi-pack promo to weeks 47-48"
    target_sku: str
    target_channel: str
    target_months: list[str]
    expected_lift_hl: float
    expected_gap_closed_pct: float
    estimated_cost: float | None
    confidence: str = Field(pattern="^(low|medium|high)$")
    evidence: list[str]    # 1-3 short evidence bullets ("Historical lift +9% on similar promo")

class RecommendationScenario(BaseModel):
    label: str = Field(pattern="^(conservative|balanced|aggressive)$")
    headline: str          # one-line summary for the card
    actions: list[RecommendationAction]
    total_expected_gap_closed_pct: float
    risk_notes: str

class RecommendationResponse(BaseModel):
    sku: str
    channel: str
    period: str
    current_gap_hl: float
    current_gap_pct: float
    scenarios: list[RecommendationScenario]   # always length 3


# schemas/explain.py
class ExplainViewRequest(BaseModel):
    page: str              # "overview" | "forecast" | "drivers" | ...
    filters: dict          # current brand/SKU/channel/period
    visible_state: dict    # serialized chart data the user is looking at

class ExplainViewSummary(BaseModel):
    headline: str
    bullets: list[str] = Field(min_length=3, max_length=3)
    suggested_next_action: str | None
```

---

## 🧠 System prompt (used by all profiles)

```
You are MarketPulse, a commercial analyst for Damm UK. You help the UK
commercial team understand why monthly sales forecasts deviate from budget
and recommend concrete actions to close the gap.

CONSTRAINTS
- Damm data is confidential. NEVER mention real supermarket or customer
  names. Refer to channels generically: "off-trade grocery", "discount",
  "premium grocery", "convenience". If a tool returns a retailer name, map
  it before showing the user.
- All volumes are in hectoliters (Hl). All currency is GBP.
- All time periods follow the convention "MMM.YY" in Spanish abbreviations
  (Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic). Translate
  to English month names in your output ("November 2026").
- Be specific. Vague answers are useless to a commercial director.
- Cite numbers from the tools. Do not invent figures.

WORKFLOW
1. Identify the SKU/channel/period the user is asking about. If unclear,
   call meta_lookup to ground the names.
2. Get the gap with compare_vs_budget.
3. Explain the gap with explain_gap (top drivers).
4. If recommending action, call rank_promos and simulate_promo before
   suggesting a specific promo. Never recommend a promo without a
   simulated gap_closed_pct.
5. Return structured output matching the requested Pydantic schema.

STYLE
- Direct, executive tone. Short sentences.
- Lead with the number, then the reason, then the action.
- Use bullet points for evidence, not paragraphs.
```

---

## 📝 Prompt templates

### 3-scenario recommendation (`/api/recommend` body endpoint)

System prompt above + user message:

```
SKU: {sku}
Channel: {channel}
Period: {period}

Current gap: {gap_hl:.0f} Hl ({gap_pct:+.1%}) vs budget {budget_hl:.0f} Hl.

Top drivers: {drivers_json}
Top historical promos by ROI on this channel: {promo_roi_json}

Generate exactly THREE scenarios — conservative, balanced, aggressive —
each closing more of the gap with more risk/cost. For every action you
propose, you MUST have called simulate_promo first and use the returned
gap_closed_pct as the expected_gap_closed_pct.

Output JSON matching the RecommendationResponse schema.
```

The Instructor wrapper enforces the schema (uses the `deep` profile = Kimi K2-Instruct):

```python
import instructor
from app.services.llm import get_client

client = instructor.from_openai(
    get_client("deep").as_openai(),
    mode=instructor.Mode.JSON,
)

resp: RecommendationResponse = client.chat.completions.create(
    response_model=RecommendationResponse,
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_msg},
    ],
)
```

### "Explain this view" (`/api/explain-view`)

```
The user is on the {page} page with these filters:
{filters_json}

They are looking at this visible state:
{visible_state_json}

In three bullets aimed at a commercial director:
1. State the headline takeaway.
2. State the most important driver.
3. State the most important consequence or risk.

Then suggest one concrete next action (or null if none is warranted).

Output JSON matching the ExplainViewSummary schema.
```

### Chat (smolagents `CodeAgent` running against `/api/chat`)

The agent uses smolagents' code-agent paradigm: model writes Python that
calls the tools above. We expose a deliberately small Python sandbox —
only the tool functions and stdlib. The system prompt is the one above
plus smolagents' default code-agent suffix.

---

## 🌊 SSE streaming format (`/api/chat`)

The frontend's chat (Vercel AI SDK `useChat`) expects an SSE stream. We emit
typed events so the UI can render tool-call breadcrumbs and partial answers.

```
event: thought
data: {"text": "Looking up the gap for SKU X in November..."}

event: tool_call
data: {"name": "compare_vs_budget", "args": {"sku":"X","channel":"Y","period":"Nov.26"}}

event: tool_result
data: {"name": "compare_vs_budget", "result_summary": "Gap -120 Hl (-4.2%)"}

event: token
data: {"text": "The "}

event: token
data: {"text": "November "}

...

event: done
data: {}
```

FastAPI implementation sketch:

```python
from fastapi.responses import StreamingResponse

@router.post("/api/chat")
async def chat(req: ChatRequest):
    async def stream():
        async for ev in run_agent(req.messages):
            yield f"event: {ev.type}\ndata: {ev.json()}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
```

On the frontend, render each `tool_call` as a small grey chip in the message
bubble; `tool_result` updates the chip from "running…" to its `result_summary`.

---

## 🛡️ Failure modes & fallbacks

| Failure | Detection | Fallback |
|---|---|---|
| Novita 429 / 5xx (deep profile) | `HfHubHTTPError` | `call_with_fallback` drops to `fast` (Llama-Groq) → `fallback` (Qwen) automatically |
| Groq 429 / 5xx (fast profile) | `HfHubHTTPError` | Drops to `fallback` (Qwen, auto provider) |
| LLM hallucinated SKU not in master | Validate against `meta_lookup` | Re-prompt with `Available SKUs: [...]` |
| LLM JSON doesn't match schema | Instructor retries with validation error in context | After 2 retries, return canned "couldn't generate, here is the raw forecast" |
| Tool returned empty (e.g. no past promos on channel) | Empty list check in tool | Agent told: "No historical promos on this channel — recommend conservatively" |
| All providers down | Health-check on `/api/meta` | Switch every endpoint to **snapshot mode** (pre-baked Parquet recs) |
| All else fails | — | Hardcoded recommendation per hero SKU in `backend/app/services/agent.py:HERO_FALLBACK` |

---

## ✅ Definition of done (agent slice)

- [ ] `moonshotai/Kimi-K2-Instruct` (Novita) and `meta-llama/Llama-3.3-70B-Instruct` (Groq) both reachable from the EHubBarcelona org token (verified at smoke-test: 5.0s and 0.86s respectively)
- [ ] `call_with_fallback()` helper exercised end-to-end (deep → fast → fallback)
- [ ] All 7 tools implemented and unit-tested with mocked services
- [ ] All Pydantic schemas in `backend/app/schemas/`, re-used by Instructor + FastAPI
- [ ] `/api/recommend` returns valid `RecommendationResponse` 100% of the time using `deep` profile (Instructor + retries on schema mismatch)
- [ ] `/api/explain-view` returns 3 bullets + next action using `fast` profile (sub-2s)
- [ ] `/api/chat` SSE stream emits typed events using `fast` profile; FE renders tool-call chips
- [ ] Provider failover is exercised at H22 rehearsal (manually kill Novita route → confirm Llama serves the recommendation)
- [ ] Hero-SKU canned fallback exists and renders identically to a live response
