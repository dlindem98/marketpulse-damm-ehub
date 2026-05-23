"""GET /api/pricing/gross-per-hl — approximate "normal" price per hectolitre.

Per the hackathon coordinator's clarification: teams may approximate the
gross-of-discount price as Σ sales / Σ hL across whatever slice they need.
This endpoint exposes that on demand for sku / brand / sub-channel and an
optional period window.
"""

from datetime import date as date_t
from datetime import datetime

from fastapi import APIRouter, Query

from app.schemas import GrossPriceRate
from app.services.pricing import gross_price_per_hl

router = APIRouter(prefix="/api/pricing", tags=["pricing"])

NOTE = (
    "Approximated from Σ sales / Σ hL. Source figures are net of discount; "
    "averaged across promo + non-promo periods, this remains a reasonable "
    "proxy for the SKU's base unit value."
)


def _parse_period(p: str | None) -> date_t | None:
    if not p:
        return None
    p = p.strip()
    if "." in p:
        try:
            return datetime.strptime(p, "%b.%y").date().replace(day=1)
        except ValueError:
            return None
    if p.count("-") == 1:
        try:
            return datetime.strptime(p + "-01", "%Y-%m-%d").date()
        except ValueError:
            return None
    try:
        return datetime.strptime(p, "%Y-%m-%d").date().replace(day=1)
    except ValueError:
        return None


@router.get("/gross-per-hl", response_model=GrossPriceRate)
def gross_per_hl(
    sku: str | None = Query(default=None),
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
) -> GrossPriceRate:
    rate, n = gross_price_per_hl(
        sku=sku,
        brand=brand,
        sub_channel=sub_channel,
        period_from=_parse_period(period_from),
        period_to=_parse_period(period_to),
    )
    return GrossPriceRate(gbp_per_hl=rate, n_rows=n, note=NOTE)
