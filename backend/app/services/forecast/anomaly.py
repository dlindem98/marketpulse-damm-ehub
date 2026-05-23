"""STL decomposition + 2.5×MAD anomaly detection for Brand × SubChannel series.

For each (brand, sub_channel) series with ≥24 months of history:
  1. STL decompose into trend + seasonal + residual
  2. Compute residual MAD; flag |residual| > 2.5 × MAD as anomaly
  3. Attach a candidate_cause by scanning external columns at that month

Writes: snapshots/anomalies.parquet
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import polars as pl
from scipy.stats import median_abs_deviation
from statsmodels.tsa.seasonal import STL

ROOT = Path(__file__).resolve().parents[3]
WIDE = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"
SNAPSHOTS = ROOT / "app" / "data" / "snapshots"


def main() -> int:
    print("=" * 72)
    print("STEP 10 — Anomaly detection (STL + 2.5×MAD)")
    print("=" * 72)

    monthly = pl.read_parquet(WIDE)
    # Aggregate to brand × sub_channel
    agg = (
        monthly.group_by(["brand", "sub_channel", "date"])
        .agg(
            pl.col("Hl").sum(),
            pl.col("temp_c_anomaly").mean(),
            pl.col("trends_lager").mean(),
            pl.col("ons_retail_index").mean(),
            pl.col("uk_holidays_count").mean(),
        )
        .sort(["brand", "sub_channel", "date"])
    )

    series_keys = agg.select(["brand", "sub_channel"]).unique()
    long_enough: list[tuple[str, str]] = []
    for key in series_keys.iter_rows():
        brand, sub = key
        n = len(agg.filter((pl.col("brand") == brand) & (pl.col("sub_channel") == sub)))
        if n >= 24:
            long_enough.append((brand, sub))

    print(f"\n[1/3] {len(long_enough)} (brand, sub_channel) series with ≥24 mo")

    rows: list[dict] = []
    for brand, sub in long_enough:
        series = agg.filter((pl.col("brand") == brand) & (pl.col("sub_channel") == sub)).sort("date")
        y = series["Hl"].to_numpy()
        try:
            stl = STL(y, period=12, robust=True).fit()
        except ValueError:
            continue
        resid = stl.resid
        mad = float(median_abs_deviation(resid, scale="normal"))
        if mad == 0:
            continue
        z = resid / mad
        for i, zi in enumerate(z):
            if abs(zi) > 2.5:
                row = series.row(i, named=True)
                # candidate_cause
                cause = "Unexplained"
                if abs(row["temp_c_anomaly"] or 0) > 1.5:
                    cause = f"Weather: {row['temp_c_anomaly']:+.1f}°C vs climatology"
                elif (row["trends_lager"] or 0) < 5:
                    cause = "Lager search interest unusually low"
                elif (row["uk_holidays_count"] or 0) >= 2:
                    cause = "Calendar: 2+ UK holidays that month"
                rows.append({
                    "brand": brand,
                    "sub_channel": sub,
                    "period": row["date"],
                    "actual_hl": float(row["Hl"]),
                    "expected_hl": float(row["Hl"] - resid[i]),
                    "z_score": float(zi),
                    "candidate_cause": cause,
                })

    out = pl.DataFrame(rows, schema={
        "brand": pl.String, "sub_channel": pl.String, "period": pl.Date,
        "actual_hl": pl.Float64, "expected_hl": pl.Float64,
        "z_score": pl.Float64, "candidate_cause": pl.String,
    })
    out.write_parquet(SNAPSHOTS / "anomalies.parquet")
    print(f"\n[2/3] flagged {len(out)} anomalies")
    print(f"      cause distribution: {dict(out.group_by('candidate_cause').agg(pl.len().alias('n')).iter_rows())}")
    print(f"\n[3/3] snapshots/anomalies.parquet")
    print("\nSTEP 10 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
