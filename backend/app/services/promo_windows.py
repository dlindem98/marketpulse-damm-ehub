"""Derive promo windows (period_start..period_end) for a SKU × sub_channel.

The raw `promos.parquet` is per-week and per-grocer (Grocer A..E), with the
`sku` field being a human label like "Estrella 10x330ml Can" — not the
`material_id` ("EX23SRAN") used elsewhere. So a clean SKU-level join isn't
possible.

Strategy:
  - Resolve the brand for the requested material_id from wide_monthly.
  - Brand-keyword match promo rows on `sku` (e.g. brand "DAMM LEMON" matches
    "Damm Lemon 10x440ml Can").
  - Only emit promo windows when sub_channel == "GROCERY" — the promo data is
    grocer-only by source. Other sub-channels return an empty list.
  - Coalesce consecutive on-promo weeks of the same promo_type into a single
    window. Drop windows entirely outside [horizon_start..horizon_end].
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import polars as pl

from app.schemas import PromoWindow

PROMOS_PATH = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "promos.parquet"
WIDE_PATH   = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "wide_monthly.parquet"


# Map promo_type → frontend `type` literal
_TYPE_MAP: dict[str, str] = {
    "multi-buy":  "multibuy",
    "price-cut":  "price",
    "rollback":   "price",
    "clearance":  "display",
    "listing":    "display",
}


@lru_cache(maxsize=1)
def _promos() -> pl.DataFrame | None:
    if not PROMOS_PATH.is_file():
        return None
    return pl.read_parquet(PROMOS_PATH)


@lru_cache(maxsize=1)
def _material_to_brand() -> dict[str, str]:
    if not WIDE_PATH.is_file():
        return {}
    df = pl.read_parquet(WIDE_PATH).select(["material_id", "brand"]).unique()
    return {r["material_id"]: r["brand"] for r in df.iter_rows(named=True)}


def _brand_keywords(brand: str) -> list[str]:
    """Tokens to test against the promo `sku` label, lowercased."""
    if not brand:
        return []
    b = brand.lower()
    # Multi-word brands need both the joined form and the head token
    parts = [p for p in b.split() if len(p) > 2]
    return list(dict.fromkeys([b, *parts]))


def _label_for(promo_type: str, multi_buy_offer: str | None, price_gbp: float | None) -> str:
    if promo_type == "multi-buy" and multi_buy_offer:
        # Normalise odd whitespace / newlines from the source XLSX
        return " ".join(multi_buy_offer.split()).replace("MTB ", "").strip() or "Multi-buy"
    if promo_type == "price-cut" and price_gbp:
        return f"Price cut £{price_gbp:.2f}"
    if promo_type == "rollback" and price_gbp:
        return f"Rollback £{price_gbp:.2f}"
    return promo_type.replace("-", " ").title()


def build_promo_windows(
    *,
    material_id: str,
    sub_channel: str,
    horizon_start: date,
    horizon_end: date,
    history_months: int = 18,
) -> list[PromoWindow]:
    """Promo windows overlapping [horizon_start - history_months, horizon_end].

    Returns an empty list if the SKU is non-grocery, parquets are missing,
    or no brand-matching promos are found.
    """
    if sub_channel != "GROCERY":
        return []

    promos = _promos()
    if promos is None or len(promos) == 0:
        return []

    brand = _material_to_brand().get(material_id, "")
    keywords = _brand_keywords(brand)
    if not keywords:
        return []

    # Window of interest: 18 months history + entire horizon
    window_start = date(horizon_start.year, horizon_start.month, 1)
    # subtract history_months by month-arithmetic
    y, m = window_start.year, window_start.month
    for _ in range(history_months):
        m -= 1
        if m == 0:
            m = 12; y -= 1
    window_start = date(y, m, 1)
    window_end = horizon_end

    # Build a single string-contains pattern per the longest keyword first
    sku_lower = pl.col("sku").str.to_lowercase()
    brand_match = sku_lower.str.contains(keywords[0], literal=True)
    for kw in keywords[1:]:
        brand_match = brand_match | sku_lower.str.contains(kw, literal=True)

    sub = (
        promos.filter(
            (pl.col("on_promo") == True)  # noqa: E712
            & brand_match
            & (pl.col("iso_week") >= window_start)
            & (pl.col("iso_week") <= window_end)
        )
        .sort(["iso_week", "promo_type"])
    )

    if len(sub) == 0:
        return []

    # Coalesce consecutive same-type weeks into a single window.
    # Group on (promo_type, multi_buy_offer) so different offers stay split.
    windows: list[PromoWindow] = []
    cur_start: date | None = None
    cur_end: date | None = None
    cur_type: str | None = None
    cur_label: str | None = None

    for r in sub.iter_rows(named=True):
        wk: date = r["iso_week"]
        ptype: str = r["promo_type"]
        label = _label_for(ptype, r.get("multi_buy_offer"), r.get("price_gbp"))
        type_token = _TYPE_MAP.get(ptype, "price")

        # Continuation if same label and within 14 days of previous end
        if (
            cur_label == label
            and cur_end is not None
            and (wk - cur_end).days <= 14
        ):
            cur_end = wk + timedelta(days=6)
            continue

        # Flush previous window
        if cur_start is not None and cur_end is not None and cur_label is not None and cur_type is not None:
            windows.append(PromoWindow(
                period_start=cur_start.isoformat(),
                period_end=cur_end.isoformat(),
                label=cur_label,
                type=cur_type,  # type: ignore[arg-type]
            ))

        cur_start = wk
        cur_end = wk + timedelta(days=6)
        cur_label = label
        cur_type = type_token

    if cur_start is not None and cur_end is not None and cur_label is not None and cur_type is not None:
        windows.append(PromoWindow(
            period_start=cur_start.isoformat(),
            period_end=cur_end.isoformat(),
            label=cur_label,
            type=cur_type,  # type: ignore[arg-type]
        ))

    # Cap how many windows we annotate — too many = unreadable chart
    return windows[:8]
