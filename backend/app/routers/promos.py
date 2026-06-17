"""Promo endpoints backed by generated Parquet snapshots."""

from functools import lru_cache
import json

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.paths import snapshot_path
from app.schemas import (
    PromoAffectedProduct,
    PromoBudgetFlow,
    PromoBudgetFlowItem,
    PromoBudgetPreview,
    PromoROI,
)

router = APIRouter(prefix="/api", tags=["promos"])

PROMO_ROI = snapshot_path("promo_roi.parquet")
PROMOS = snapshot_path("promos.parquet")
FORECAST = snapshot_path("forecast.parquet")
TARGETS = snapshot_path("targets.parquet")
META = snapshot_path("meta.json")

LIFT_HISTORY_WINDOW = 12
REAL_PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"]
CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}


@lru_cache(maxsize=1)
def _roi() -> pl.DataFrame:
    if not PROMO_ROI.is_file():
        raise HTTPException(status_code=503, detail="promo_roi.parquet missing — run make train")
    return pl.read_parquet(PROMO_ROI)


@lru_cache(maxsize=1)
def _promos() -> pl.DataFrame:
    if not PROMOS.is_file():
        raise HTTPException(status_code=503, detail="promos.parquet missing — run make data")
    return pl.read_parquet(PROMOS)


@lru_cache(maxsize=1)
def _forecast() -> pl.DataFrame:
    if not FORECAST.is_file():
        return pl.DataFrame()
    return pl.read_parquet(FORECAST)


@lru_cache(maxsize=1)
def _targets() -> pl.DataFrame:
    if not TARGETS.is_file():
        return pl.DataFrame()
    return pl.read_parquet(TARGETS)


@lru_cache(maxsize=1)
def _sku_labels() -> dict[str, str]:
    if not META.is_file():
        return {}
    meta = json.loads(META.read_text())
    return {
        str(row.get("id")): str(row.get("label") or row.get("id"))
        for row in meta.get("skus", [])
        if row.get("id")
    }


@lru_cache(maxsize=1)
def _lift_history_by_type() -> dict[str, list[float]]:
    """Per-promo-type monthly lift proxy series (oldest→newest).

    True per-instance lift isn't materialised in the snapshots, so we use
    discount depth weighted by event count as a directional proxy:
      lift_proxy ≈ avg((baseline - price) / baseline) per month, across all
      promo events of that type.
    Empty for promo_types with no on-promo history.
    """
    if not PROMOS.is_file():
        return {}
    p = _promos()
    if p.is_empty():
        return {}
    on_promo = (
        p.filter(pl.col("on_promo") == True)  # noqa: E712
         .with_columns(
             month=pl.col("iso_week").dt.truncate("1mo"),
             depth=(
                 (pl.col("baseline_price_gbp") - pl.col("price_gbp"))
                 / pl.col("baseline_price_gbp").clip(lower_bound=0.01)
             ),
         )
         .drop_nulls("depth")
         .group_by(["promo_type", "month"])
         .agg(lift=pl.col("depth").mean())
         .sort(["promo_type", "month"])
    )
    out: dict[str, list[float]] = {}
    for r in on_promo.iter_rows(named=True):
        out.setdefault(r["promo_type"], []).append(float(r["lift"]))
    return {k: v[-LIFT_HISTORY_WINDOW:] for k, v in out.items()}


def _month_expr() -> pl.Expr:
    return pl.col("iso_week").dt.strftime("%Y-%m").alias("month")


def _available_months(p: pl.DataFrame) -> list[str]:
    rows = (
        p.filter(
            (pl.col("on_promo") == True)  # noqa: E712
            & pl.col("promo_type").is_in(REAL_PROMO_TYPES)
        )
         .with_columns(_month_expr())
         .group_by("month")
         .agg(events=pl.len())
         .sort(["events", "month"], descending=[True, False])
    )
    return [str(r["month"]) for r in rows.iter_rows(named=True)]


def _forecast_months() -> set[str]:
    forecast = _forecast()
    if forecast.is_empty() or "date" not in forecast.columns:
        return set()
    return set(
        forecast.select(pl.col("date").dt.strftime("%Y-%m").alias("month"))["month"].to_list()
    )


def _roi_by_type() -> dict[str, dict]:
    df = _roi()
    if df.is_empty():
        return {}
    rows = (
        df.group_by("promo_type")
        .agg(
            avg_lift_pct=pl.col("avg_lift_pct").mean(),
            avg_lift_hl=pl.col("avg_lift_hl").mean(),
            confidence_score=pl.col("confidence").replace(CONFIDENCE_RANK).cast(pl.Int64).max(),
        )
    )
    score_to_confidence = {v: k for k, v in CONFIDENCE_RANK.items()}
    return {
        str(r["promo_type"]): {
            "avg_lift_pct": float(r["avg_lift_pct"]) if r["avg_lift_pct"] is not None else None,
            "avg_lift_hl": float(r["avg_lift_hl"]) if r["avg_lift_hl"] is not None else None,
            "confidence": score_to_confidence.get(int(r["confidence_score"] or 0), "low"),
        }
        for r in rows.iter_rows(named=True)
    }


def _brand_key_expr() -> pl.Expr:
    return pl.col("brand").str.replace(" .*", "").str.to_uppercase().alias("brand_key")


def _affected_products(month: str, promo_type: str, limit: int = 3) -> list[PromoAffectedProduct]:
    forecast = _forecast()
    targets = _targets()
    if forecast.is_empty():
        return []

    roi_rows = _roi().filter(pl.col("promo_type") == promo_type)
    brand_lift = {
        str(r["brand_key"]): float(r["avg_lift_pct"])
        for r in roi_rows.select(["brand_key", "avg_lift_pct"]).iter_rows(named=True)
    }
    wanted_brands = set(brand_lift)

    date_text = f"{month}-01"
    fc = (
        forecast.filter(
            (pl.col("sub_channel") == "GROCERY")
            & (pl.col("date").dt.strftime("%Y-%m-%d") == date_text)
        )
        .with_columns(_brand_key_expr())
        .select(["material_id", "brand", "brand_key", "Hl_hat_p50"])
    )
    if fc.is_empty():
        return []
    if wanted_brands:
        matched = fc.filter(pl.col("brand_key").is_in(list(wanted_brands)))
        if not matched.is_empty():
            fc = matched

    if not targets.is_empty():
        tg = (
            targets.filter(
                (pl.col("sub_channel") == "GROCERY")
                & (pl.col("date").dt.strftime("%Y-%m-%d") == date_text)
            )
            .select(["material_id", "target_hl"])
        )
        fc = fc.join(tg, on="material_id", how="left")
    else:
        fc = fc.with_columns(target_hl=pl.lit(None, dtype=pl.Float64))

    fallback_lift = float(roi_rows["avg_lift_pct"].mean()) if not roi_rows.is_empty() else None
    labels = _sku_labels()
    products: list[dict] = []
    for row in fc.iter_rows(named=True):
        forecast_hl = float(row["Hl_hat_p50"] or 0)
        target_hl = float(row["target_hl"]) if row.get("target_hl") is not None else None
        gap_pct = (
            (forecast_hl - target_hl) / target_hl
            if target_hl is not None and target_hl > 0
            else None
        )
        lift_pct = brand_lift.get(str(row["brand_key"]), fallback_lift)
        products.append({
            "material_id": str(row["material_id"]),
            "brand": str(row["brand"]),
            "label": labels.get(str(row["material_id"]), f"{row['brand']} · {row['material_id']}"),
            "forecast_hl": forecast_hl,
            "target_hl": target_hl,
            "gap_pct": gap_pct,
            "estimated_lift_pct": lift_pct,
            "sort_score": abs(forecast_hl * (lift_pct or 0)) + abs((gap_pct or 0) * forecast_hl),
        })

    products.sort(key=lambda p: p["sort_score"], reverse=True)
    return [
        PromoAffectedProduct(
            material_id=p["material_id"],
            brand=p["brand"],
            label=p["label"],
            forecast_hl=p["forecast_hl"],
            target_hl=p["target_hl"],
            gap_pct=p["gap_pct"],
            estimated_lift_pct=p["estimated_lift_pct"],
        )
        for p in products[:limit]
    ]


def _preview(month: str, promo_type: str, flow_item: PromoBudgetFlowItem) -> PromoBudgetPreview:
    lift = flow_item.avg_lift_pct
    if lift is None:
        lift_text = "has limited historical lift evidence"
    elif lift > 0.02:
        lift_text = f"has historically lifted volume by about {lift * 100:.1f}%"
    elif lift < -0.02:
        lift_text = f"has historically underperformed by about {abs(lift) * 100:.1f}%"
    else:
        lift_text = "has historically been close to baseline"

    headline = (
        f"{promo_type.replace('-', ' ').title()} takes "
        f"{flow_item.usage_pct * 100:.0f}% of {month} promo activity."
    )
    explanation = (
        f"This is a promo-plan allocation view: {promo_type.replace('-', ' ')} {lift_text}. "
        f"Confidence is {flow_item.confidence}, so use it as directional context."
    )
    return PromoBudgetPreview(
        promo_type=promo_type,
        headline=headline,
        explanation=explanation,
        affected_products=_affected_products(month, promo_type, limit=3),
    )


@router.get("/promos/roi", response_model=list[PromoROI])
def get_promo_roi(
    sub_channel: str | None = Query(default=None),
    top_k: int = Query(default=10, ge=1, le=50),
) -> list[PromoROI]:
    df = _roi()
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    df = df.sort("roi", descending=True, nulls_last=True)
    lift_hist = _lift_history_by_type()
    return [
        PromoROI(
            promo_type=r["promo_type"],
            sub_channel=r["sub_channel"],
            avg_lift_pct=float(r["avg_lift_pct"]),
            avg_lift_hl=float(r["avg_lift_hl"]),
            estimated_cost=float(r["estimated_cost"]) if r["estimated_cost"] else None,
            roi=float(r["roi"]) if r["roi"] is not None else None,
            n_observations=int(r["n_observations"]),
            confidence=r["confidence"],
            lift_history=lift_hist.get(r["promo_type"], []),
        )
        for r in df.head(top_k).iter_rows(named=True)
    ]


@router.get("/promos/budget-flow", response_model=PromoBudgetFlow)
def get_promo_budget_flow(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    promo_type: str | None = Query(default=None),
) -> PromoBudgetFlow:
    promos = _promos()
    available = _available_months(promos)
    forecast_months = _forecast_months()
    default_month = next(
        (m for m in available if m in forecast_months),
        available[0] if available else "",
    )
    selected_month = month or default_month
    if not selected_month:
        return PromoBudgetFlow(
            month="",
            available_months=[],
            total_promo_events=0,
            dominant_promo_type=None,
            flow=[],
            preview=None,
        )

    month_promos = (
        promos.filter(
            (pl.col("on_promo") == True)  # noqa: E712
            & pl.col("promo_type").is_in(REAL_PROMO_TYPES)
        )
        .with_columns(_month_expr())
        .filter(pl.col("month") == selected_month)
    )
    if month_promos.is_empty():
        return PromoBudgetFlow(
            month=selected_month,
            available_months=available,
            total_promo_events=0,
            dominant_promo_type=None,
            flow=[],
            preview=None,
        )

    grouped = (
        month_promos.group_by("promo_type")
        .agg(event_count=pl.len())
        .sort("event_count", descending=True)
    )
    total = int(grouped["event_count"].sum())
    roi = _roi_by_type()
    flow: list[PromoBudgetFlowItem] = []
    for row in grouped.iter_rows(named=True):
        ptype = str(row["promo_type"])
        meta = roi.get(ptype, {})
        flow.append(PromoBudgetFlowItem(
            promo_type=ptype,
            usage_pct=float(row["event_count"]) / max(total, 1),
            event_count=int(row["event_count"]),
            avg_lift_pct=meta.get("avg_lift_pct"),
            avg_lift_hl=meta.get("avg_lift_hl"),
            confidence=meta.get("confidence", "low"),
        ))

    dominant = flow[0].promo_type if flow else None
    selected_type = promo_type if promo_type in {f.promo_type for f in flow} else dominant
    selected_item = next((f for f in flow if f.promo_type == selected_type), None)

    return PromoBudgetFlow(
        month=selected_month,
        available_months=available,
        total_promo_events=total,
        dominant_promo_type=dominant,
        flow=flow,
        preview=_preview(selected_month, selected_type, selected_item)
        if selected_type and selected_item else None,
    )
