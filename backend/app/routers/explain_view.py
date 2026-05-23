"""POST /api/explain-view — LLM-generated 3-bullet exec summary of the current view."""

from __future__ import annotations

import json

from fastapi import APIRouter

from app.schemas import ExplainViewRequest, ExplainViewSummary
from app.services.llm import call_with_fallback

router = APIRouter(prefix="/api", tags=["explain-view"])

SYSTEM_PROMPT = """You are Ramp, a commercial analyst for Damm UK.
The user is looking at a dashboard view. Summarize what they should take away.

OUTPUT: strict JSON, exactly:
{
  "headline":  "one-sentence top-level finding",
  "bullets":   ["3 bullets, each 1 short sentence"],
  "suggested_next_action": "one-sentence next step or null"
}

CONSTRAINTS:
- Never mention specific retailer names.
- Cite numbers from the visible state.
- Be specific and short. No filler.
"""


@router.post("/explain-view", response_model=ExplainViewSummary)
def post_explain_view(req: ExplainViewRequest) -> ExplainViewSummary:
    user_msg = (
        f"Page: {req.page}\n"
        f"Filters: {json.dumps(req.filters)}\n"
        f"Visible state: {json.dumps(req.visible_state)[:1500]}\n\n"
        "Return your 3-bullet summary as JSON per the system message."
    )
    try:
        resp = call_with_fallback(
            "fast",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=300,
        )
        text = resp.choices[0].message.content or ""
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:].strip()
        parsed = json.loads(text)
        bullets = list(parsed.get("bullets") or [])[:3]
        while len(bullets) < 3:
            bullets.append("(no further insight)")
        return ExplainViewSummary(
            headline=str(parsed.get("headline", "View summary"))[:140],
            bullets=bullets,
            suggested_next_action=parsed.get("suggested_next_action"),
        )
    except Exception:
        return ExplainViewSummary(
            headline=f"Summary of {req.page}",
            bullets=[
                "Unable to generate LLM summary — see the underlying data.",
                f"Filters applied: {list(req.filters.keys())}.",
                "Try refreshing or check backend logs for HF Inference errors.",
            ],
            suggested_next_action=None,
        )
