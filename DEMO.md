# Demo Narrative — MarketPulse UK

> Most teams will show features. We show a **story**: one SKU, one problem, one decision. 90 seconds end-to-end, then deeper dives if time.

## 🎬 The hero story (5-minute live demo)

### Setup (15s)
> *"Damm sells in the UK. The commercial team tracks performance in Excel: sales vs. budget, with notes on promotions. They want to know — for each brand and SKU — whether the month will close above or below budget, **why**, and **what to do** if it's going to miss. That's MarketPulse UK."*

### Act 1 — The problem (45s) · Overview page
> *"Here's our forecast for the next 8 weeks across all UK SKUs. The dashboard immediately surfaces three problem zones. The biggest one: **Estrella Damm 33cl in off-trade is projected to close November 4.2% under budget**, roughly £X of gap."*

Click the SKU → drill into forecast detail.

> *"The line chart shows actuals, forecast and the budget line. The grey band is our 80% prediction interval — so we're not just giving a number, we're giving a confidence range. The gap appears in weeks 46–48."*

### Act 2 — The *why* (60s) · Deviation drivers page
> *"Why is this SKU below budget? We run SHAP on our LightGBM forecaster. The top three drivers, in order: lower-than-planned promo coverage in weeks 46–47, an unfavorable weather forecast, and a soft Google-Trends signal for the brand. The model isn't a black box — every prediction is decomposed into the features that drove it."*

Show the SHAP waterfall.

> *"And just to validate: our causal impact analysis on last year's similar promo confirms that multi-pack promos on this SKU historically deliver around +9% lift over 4 weeks."*

### Act 3 — The *what to do* (90s) · Simulator + Recommendations
> *"So what can the commercial team actually do? Open the simulator."*

Drag sliders: extend promo to weeks 47–48, discount 10%, off-trade channel.

> *"The forecast re-runs live and shows: this single action closes **68% of the gap**, at an estimated cost of £X. The new prediction interval still sits below budget — we're honest about that."*

Switch to Recommendations page.

> *"Our agent — powered by Llama 3.3 through Hugging Face Inference — turns this into three scenarios for the commercial director:
> - **Conservative:** extend existing multi-pack promo → closes 68% of gap, low risk
> - **Balanced:** add a secondary SKU bundle in colder regions → closes 92%, medium risk
> - **Aggressive:** combine both with channel push → exceeds budget by 3%, higher cost
>
> Each scenario has expected gap closure, confidence, and the data evidence behind it."*

Click "Explain this view".

> *"And for any view in the dashboard, the LLM produces a 3-bullet exec summary the commercial director can paste into an email."*

### Act 4 — The chat (30s) · Chat page
Type: *"What if cold weather hits the south earlier than forecast?"*

> *"The agent has tools to re-run the forecast, query the data, and explain. It's not a chatbot bolted on — it's the same engine that powers the dashboard, just accessed conversationally."*

### Close (20s)
> *"That's MarketPulse UK. Built in 24 hours: Polars + LightGBM + a Chronos foundation model for forecasting; SHAP and causal impact for explaining; a Llama 3.3 agent for recommendations. End-to-end, code on the repo, deterministic demo data. We didn't just predict — we explained and recommended. That's where the commercial value is."*

---

## 🎯 What each scene proves to the judges

| Scene | Criterion proved |
|---|---|
| Overview gap detection | Forecast vs budget ✅ · Working demo ✅ |
| SHAP drivers | Explainability ✅ · Technical robustness ✅ |
| Causal impact | Promotion analysis ✅ · Data usage ✅ |
| Simulator | Actionability ✅ · Technical robustness ✅ |
| 3-scenario LLM output | Actionability ✅ · Explainability ✅ |
| External sources footer | Data usage ✅ |
| GitHub repo + `streamlit run` | Repo + run instructions ✅ |

Every single checklist item appears in the live demo without us pointing at it.

---

## 🎤 Q&A prep — likely judge questions

**Q: How accurate is the forecast?**
> "On a 12-week backtest, our ensemble MAPE is X% at SKU × channel level, Y% at brand level. We always show prediction intervals so the user sees uncertainty, not just a point."

**Q: Why an LLM? Couldn't you just show the numbers?**
> "Two reasons. First, the LLM converts SHAP + simulator output into language a commercial director can act on without reading a chart. Second, the chat lets non-technical users ask 'what if' without leaving Excel mode. The numbers are the engine; the LLM is the interface."

**Q: What's the foundation model doing?**
> "Chronos-Bolt is Amazon's time-series foundation model. We call it zero-shot through Hugging Face Inference — it's never trained on Damm data, but it provides a strong independent baseline. We ensemble it with our LightGBM model; the ensemble beats either alone and rescues SKUs with short history."

**Q: How does the recommendation know the cost of a promo?**
> "We use the promo cost field from the promo plan. ROI = causal lift × revenue per unit – promo cost. Where cost isn't in the data, we mark the recommendation as 'cost TBD' and surface it transparently."

**Q: What didn't you have time for?**
> "Marketing Mix Modeling for cross-channel budget allocation, and RAG over UK retail market reports. Both are natural extensions; the architecture supports them."

**Q: Could this go to production?**
> "The forecast layer and dashboard yes — Nixtla, LightGBM, Streamlit are production-grade. The LLM layer needs a stricter eval suite and prompt regression tests. Storage would move from local Parquet to a warehouse."

---

## 🛡️ Demo safety net

- Pre-compute all forecasts/recommendations into Parquet at H22.
- Hard-code one "hero SKU" path so a live API failure doesn't kill the narrative.
- Record a **2-minute screen capture** of the full happy path the morning of the demo.
- Disable anything that talks to the network during the live run except the agent chat (and even that has a stub fallback).
- Hidden `⌘ + .` shortcut in the frontend swaps the API client between **live** and **snapshot** mode — if the venue Wi-Fi is bad, one keystroke fixes it.
- **Start both backend and frontend before walking on stage.** Use a single `make demo` script that launches both with logs in one terminal. Never restart live.
- Have `http://localhost:5173` open on the projector and `http://localhost:8000/docs` on a second screen — judges sometimes ask to see the API.

---

## ✂️ If the demo slot shrinks to 3 minutes

Cut: chat (Act 4) and the Q&A buffer. Keep: gap → why → simulator → recommendation. That's the spine. Everything else is bonus.
