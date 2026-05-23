"""Schema for /api/pricing/gross-per-hl."""

from __future__ import annotations

from pydantic import BaseModel


class GrossPriceRate(BaseModel):
    """Approximated "normal" price per hectolitre for a data slice.

    Computed as Σ revenue / Σ Hl over the requested filter. The underlying
    source is net sales rather than true gross sales — at the aggregate
    level (many promo + non-promo months) it averages out to a reasonable
    proxy for the unit value. See backend/app/services/pricing.py.
    """

    gbp_per_hl: float | None        # null when no observations match
    n_rows: int                     # number of (sku × sub_channel × month) cells
    note: str                       # caveat string, surfaced verbatim in the UI
