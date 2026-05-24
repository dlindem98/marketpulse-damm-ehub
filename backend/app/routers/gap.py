"""GET /api/gap — joins forecast × targets, filters out model-collapse rows.

Adds a `forecast_quality` score in [0, 1] per row, computed from the ratio
of the median forecast to the predicted upper bound. SKUs where the model
has no signal (p50 near zero with a wide p90 band) get quality near 0 and
are excluded from the inbox by default — they look like -98% gaps but
they're actually "the model gave up".

Query params:
  brand, sub_channel        — filters
  from, to                  — period range (YYYY-MM)
  sort                      — gap_pct_asc | gap_pct_desc | gap_hl_asc | gap_hl_desc
  limit                     — max rows
  min_quality               — drop rows below this forecast quality (default 0.15)
                              set to 0 to see everything (including model failures)
"""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import GapItem
from app.services.pricing import price_by_keys

router = APIRouter(prefix="/api", tags=["gap"])

FORECAST = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"
TARGETS  = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "targets.parquet"
ACTUALS  = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "wide_monthly.parquet"

# History window for the inbox sparkline. Data is monthly, so this is
# 12 months even though we call the field `history_hl` (week was the
# original plan — the schema name is kept stable).
HISTORY_WINDOW = 12


@lru_cache(maxsize=1)
def _history_table() -> pl.DataFrame:
    """(material_id, sub_channel, date, hist_gap_hl) — historical actual vs target gap."""
    if not ACTUALS.is_file() or not TARGETS.is_file():
        return pl.DataFrame(schema={
            "material_id": pl.Utf8, "sub_channel": pl.Utf8,
            "date": pl.Date, "hist_gap_hl": pl.Float64, "hist_gap_pct": pl.Float64,
        })
    actuals = (
        pl.read_parquet(ACTUALS)
          .select(["material_id", "sub_channel", "date", "Hl"])
    )
    tg = pl.read_parquet(TARGETS).select(["material_id", "sub_channel", "date", "target_hl"])
    return (
        actuals.join(tg, on=["material_id", "sub_channel", "date"], how="left")
               .with_columns(
                   hist_gap_hl=(pl.col("Hl") - pl.col("target_hl").fill_null(0.0)),
                   hist_gap_pct=(
                       (pl.col("Hl") - pl.col("target_hl").fill_null(0.0))
                       / pl.col("target_hl").fill_null(0.0).clip(lower_bound=1)
                   ).clip(lower_bound=-1.0, upper_bound=5.0),
               )
               .sort(["material_id", "sub_channel", "date"])
    )


@lru_cache(maxsize=1)
def _gap_table() -> pl.DataFrame:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(status_code=503, detail="forecast.parquet or targets.parquet missing")
    fc = pl.read_parquet(FORECAST)
    tg = pl.read_parquet(TARGETS)
    return (
        fc.join(tg, on=["material_id", "sub_channel", "date"], how="left")
          .with_columns(
              gap_hl=(pl.col("Hl_hat_p50") - pl.col("target_hl")),
              # Clip gap_pct so we don't render -3000% chips for division-by-tiny
              gap_pct=((pl.col("Hl_hat_p50") - pl.col("target_hl")) / pl.col("target_hl").clip(lower_bound=1)).clip(
                  lower_bound=-1.0, upper_bound=5.0,
              ),
              # Forecast quality: p50 relative to the upper bound. Wide-band
              # collapses (p50 ≈ 0 with p90 large) score near 0.
              forecast_quality=(
                  pl.col("Hl_hat_p50") / pl.max_horizontal(pl.col("Hl_hat_p90"), pl.lit(1.0))
              ).clip(lower_bound=0.0, upper_bound=1.0),
          )
          .with_columns(
              confidence=(
                  pl.when(pl.col("forecast_quality") >= 0.4).then(pl.lit("high"))
                    .when(pl.col("forecast_quality") >= 0.2).then(pl.lit("medium"))
                    .otherwise(pl.lit("low"))
              ),
          )
    )


@router.get("/gap", response_model=list[GapItem])
def get_gap(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
    sort: str = Query(default="gap_hl_asc"),  # biggest absolute Hl bleed first
    limit: int = Query(default=50, ge=1, le=2000),
    min_quality: float = Query(default=0.25, ge=0.0, le=1.0),
) -> list[GapItem]:
    df = _gap_table()
    if brand:
        df = df.filter(pl.col("brand") == brand)
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    if min_quality > 0:
        df = df.filter(pl.col("forecast_quality") >= min_quality)

    # Sort logic
    sort_col = "gap_pct" if sort.startswith("gap_pct") else "gap_hl"
    df = df.sort(sort_col, descending=sort.endswith("_desc"))

    hist = _history_table()

    # Pre-group history into a {(material, sub_channel): [(date, gap_hl, gap_pct), ...]}
    # lookup so the per-row history slice is O(1) per item.
    hist_by_key: dict[tuple[str, str], list[tuple]] = {}
    if hist.height > 0:
        for r in hist.iter_rows(named=True):
            key = (r["material_id"], r["sub_channel"])
            hist_by_key.setdefault(key, []).append(
                (r["date"], r["hist_gap_hl"], r["hist_gap_pct"])
            )

    rows = list(df.head(limit).iter_rows(named=True))

    # One bulk lookup of £/hL for every SKU × sub_channel pair in the result
    # set, rather than per-row I/O. Used to attach `gap_gbp` so the inbox can
    # show £ next to each row's hL gap.
    pricing_keys = list({(r["material_id"], r["sub_channel"]) for r in rows})
    rates = price_by_keys(pricing_keys)

    out: list[GapItem] = []
    for r in rows:
        key = (r["material_id"], r["sub_channel"])
        series = hist_by_key.get(key, [])
        # Take history strictly before the forecast row's date, last HISTORY_WINDOW.
        cutoff = r["date"]
        prior = [t for t in series if t[0] < cutoff][-HISTORY_WINDOW:]
        history_hl = [float(t[1] or 0) for t in prior]
        prev_pct = float(prior[-1][2]) if prior and prior[-1][2] is not None else None
        rate = rates.get(key)
        gap_hl_val = float(r["gap_hl"] or 0)
        out.append(GapItem(
            sku=r["material_id"],
            sub_channel=r["sub_channel"],
            period=r["date"].strftime("%b.%y"),
            forecast_hl=float(r["Hl_hat_p50"]),
            budget_hl=float(r["target_hl"] or 0),
            gap_hl=gap_hl_val,
            gap_pct=float(r["gap_pct"] or 0),
            confidence=r["confidence"],
            history_hl=history_hl,
            prev_week_gap_pct=prev_pct,
            gap_gbp=(gap_hl_val * rate) if rate is not None else None,
        ))
    return out


# ──────────────────────────────────────────────────────────────────────────────
# /api/targets — full target series for one SKU × sub_channel (every month
# we have a target row for). Distinct from /api/gap which filters to at-risk
# SKUs only. Used by the decision-page chart so the dashed target line is
# continuous instead of fragmented at "on-plan" months that /api/gap drops.
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/targets")
def get_targets(
    sku: str = Query(...),
    sub_channel: str = Query(...),
):
    """Return every target row for one SKU × sub_channel as a list of
    {period, target_hl, source} entries, sorted by period.

    Period format is "Mon.YY" to match what the FE uses everywhere else.
    """
    if not TARGETS.is_file():
        raise HTTPException(status_code=503, detail="targets.parquet missing")
    df = (
        pl.read_parquet(TARGETS)
        .filter(
            (pl.col("material_id") == sku) & (pl.col("sub_channel") == sub_channel)
        )
        .sort("date")
    )
    return [
        {
            "period": r["date"].strftime("%b.%y"),
            "period_start": r["date"].isoformat(),
            "target_hl": float(r["target_hl"]),
            "source": r.get("target_source"),
        }
        for r in df.iter_rows(named=True)
    ]
