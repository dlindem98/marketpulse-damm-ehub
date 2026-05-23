"""POST /api/brief — generate a Dia-style call brief for a customer meeting.

The frontend already knows which SKUs belong to the customer (via the
fake hash-bucket split on GROCERY in `lib/calls.ts`), so it sends the
precomputed list. The backend just:

  1. Loads the existing news cache, picks the most-recent items relevant
     to the customer / Damm brands.
  2. Calls the LLM (Kimi K2 "deep" profile) to synthesise three prose
     pieces: the framing headline, the push-forward title, and the
     push-forward body — plus a one-line "recommended ask" per SKU.
  3. Returns a fully structured BriefResponse the FE renders verbatim.

If the LLM call fails we fall back to deterministic stubs so the page
still renders something usable — never let the brief 5xx.
"""

from __future__ import annotations

import json
import logging
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import news as news_svc
from app.services.llm import call_with_fallback

router = APIRouter(prefix="/api", tags=["brief"])

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────────────────────────────────


class BriefSkuInput(BaseModel):
    """One at-risk SKU passed in by the frontend."""
    sku: str
    sub_channel: str
    period: str               # "Nov.26" (frontend's display string is fine)
    sku_label: str            # already humanised by FE via meta.skus
    gap_pct: float            # signed, negative = behind plan
    gap_hl: float             # signed
    top_driver: str | None = None  # human-readable, e.g. "promo gap"


class BriefRequest(BaseModel):
    customer: str             # display label, e.g. "Tesco"
    customer_key: Literal["tesco", "sainsburys", "asda", "morrisons", "on_trade"]
    meeting_weekday: str      # "Wednesday"
    meeting_in_days: int = Field(ge=0, le=30)
    skus: list[BriefSkuInput] # already filtered to this customer's basket


class BriefSkuRow(BaseModel):
    sku_label: str
    sub_channel: str
    period: str
    gap_pct: float
    gap_hl: float
    top_driver: str | None
    recommended_ask: str | None


class BriefNewsItem(BaseModel):
    title: str
    url: str
    source_domain: str
    published_at: str | None


class BriefAgendaItem(BaseModel):
    time: str
    title: str


class BriefResponse(BaseModel):
    customer: str
    meeting_label: str        # "Wednesday in 2 days"
    headline: str             # 1-2 sentences framing the call
    push_forward_title: str   # the ONE big ask
    push_forward_body: str    # 2-3 sentence rationale
    top_skus: list[BriefSkuRow]
    market_context: list[BriefNewsItem]
    agenda: list[BriefAgendaItem]


# ──────────────────────────────────────────────────────────────────────────
# LLM prompt
# ──────────────────────────────────────────────────────────────────────────


_SYSTEM = """You are Ramp, a commercial-planning assistant for Damm UK.
You write one-page meeting briefs for a UK Commercial Manager prepping for a customer call.

Voice:
- Specific, terse, actionable. No filler.
- Cite the numbers you're given (gap %, gap hL, days).
- Sound like a colleague who's already done the analysis, not a generic AI.
- Never invent promotional mechanics or numbers not present in the input.

Output: STRICT JSON only — no markdown fences, no prose outside the JSON.
"""


def _build_user_prompt(req: BriefRequest, total_gap_hl: float) -> str:
    sku_lines = "\n".join(
        f"- {s.sku_label} ({s.sub_channel}, {s.period}): "
        f"{s.gap_pct * 100:+.0f}% / {s.gap_hl:+.1f}k hL"
        + (f" · top driver: {s.top_driver}" if s.top_driver else "")
        for s in req.skus[:5]
    )
    return f"""Customer call: {req.customer} — {req.meeting_weekday}, in {req.meeting_in_days} days.

Top SKUs at risk in this customer's basket ({len(req.skus)} total, showing top 5):
{sku_lines}

Combined predicted miss across the basket: {total_gap_hl:+.1f}k hL.

Produce a one-page meeting brief. Return STRICT JSON:
{{
  "headline": "1-2 warm sentences framing the meeting. Mention the day, the basket size, and the dominant issue.",
  "push_forward_title": "ONE specific action to push for in the meeting (8-14 words). Be concrete — name the SKU and the mechanic.",
  "push_forward_body": "2-3 sentences explaining the action. Cite the gap, the lever, and a likely buyer concession to ask for.",
  "sku_asks": ["one short recommended ask per SKU, in the same order as the input — 4-10 words each"]
}}

Rules:
- `sku_asks` MUST have exactly {len(req.skus[:5])} items (one per top-5 SKU).
- Never mention promotional lifts you weren't given. Speak to the driver if one is provided.
- The push-forward action should be the highest-impact single ask, derived from the top SKU.
"""


# ──────────────────────────────────────────────────────────────────────────
# News selection — keep it simple, most-recent on-topic
# ──────────────────────────────────────────────────────────────────────────


def _news_for_brief(limit: int = 5) -> list[BriefNewsItem]:
    """Top N news articles, most-recent first.

    We don't filter by customer here — the news rail already filters to
    Damm-relevant trade press. Any brand/competitor signal is useful
    context for any customer call.
    """
    articles, _updated = news_svc.list_articles(limit=limit)
    return [
        BriefNewsItem(
            title=a.title,
            url=a.url,
            source_domain=a.source_domain,
            published_at=(a.published_at or a.fetched_at).isoformat()
            if (a.published_at or a.fetched_at) else None,
        )
        for a in articles[:limit]
    ]


# ──────────────────────────────────────────────────────────────────────────
# Endpoint
# ──────────────────────────────────────────────────────────────────────────


@router.post("/brief", response_model=BriefResponse)
def post_brief(req: BriefRequest) -> BriefResponse:
    total_gap_hl = sum(s.gap_hl for s in req.skus)

    # LLM prose pieces — fallback to deterministic stubs on any failure.
    prose: dict = {}
    try:
        resp = call_with_fallback(
            "deep",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _build_user_prompt(req, total_gap_hl)},
            ],
            max_tokens=700,
        )
        content = (resp.choices[0].message.content or "").strip()
        # Strip ```json fences if the model adds them despite instructions
        if content.startswith("```"):
            content = content.split("```", 2)[1]
            if content.startswith("json"):
                content = content[4:].strip()
        prose = json.loads(content)
    except Exception as e:
        log.warning("Brief LLM call failed (%s); using fallback prose.", e)
        prose = {}

    headline = prose.get("headline") or (
        f"Walking into the {req.customer} meeting {req.meeting_weekday}: "
        f"{len(req.skus)} SKUs behind plan, total bleed {total_gap_hl:+.1f}k hL. "
        "The list below is what to bring."
    )
    push_title = prose.get("push_forward_title") or (
        f"Walk the buyer through the top {min(3, len(req.skus))} at-risk SKUs"
    )
    push_body = prose.get("push_forward_body") or (
        f"The {req.customer} basket is forecasted to miss by {total_gap_hl:+.1f}k hL "
        "in the next 9 months. Lead with the biggest miss, anchor in the top driver, "
        "and ask for a concession on either promo timing or listing depth."
    )

    sku_asks = prose.get("sku_asks") or []
    # Pad / truncate to len(top-5)
    top_n = req.skus[:5]
    while len(sku_asks) < len(top_n):
        sku_asks.append("Discuss intervention options")

    top_skus = [
        BriefSkuRow(
            sku_label=s.sku_label,
            sub_channel=s.sub_channel,
            period=s.period,
            gap_pct=s.gap_pct,
            gap_hl=s.gap_hl,
            top_driver=s.top_driver,
            recommended_ask=str(sku_asks[i])[:120],
        )
        for i, s in enumerate(top_n)
    ]

    # Stubbed agenda — real calendar integration is out of scope for the
    # hackathon. Title slot 2 reflects the LLM's push-forward action so the
    # agenda links back to the headline ask.
    agenda = [
        BriefAgendaItem(time="9:00am", title="Buyer intro & quarterly review"),
        BriefAgendaItem(time="10:00am", title=push_title[:80]),
        BriefAgendaItem(time="11:00am", title="Q1 pricing commitment"),
        BriefAgendaItem(time="11:30am", title="New listings & trial pack discussion"),
    ]

    return BriefResponse(
        customer=req.customer,
        meeting_label=(
            "Today"
            if req.meeting_in_days == 0
            else "Tomorrow"
            if req.meeting_in_days == 1
            else f"{req.meeting_weekday} in {req.meeting_in_days} days"
        ),
        headline=headline,
        push_forward_title=push_title,
        push_forward_body=push_body,
        top_skus=top_skus,
        market_context=_news_for_brief(limit=5),
        agenda=agenda,
    )
