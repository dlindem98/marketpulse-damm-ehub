from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/debug", tags=["debug-data"])

SNAPSHOTS_DIR = Path(__file__).resolve().parents[1] / "data" / "snapshots"


def _parquet_files() -> dict[str, Path]:
    if not SNAPSHOTS_DIR.exists():
        return {}
    return {path.stem: path for path in sorted(SNAPSHOTS_DIR.glob("*.parquet"))}


def _row_count(path: Path) -> int:
    return pl.scan_parquet(path).select(pl.len().alias("rows")).collect().item()


@router.get("/parquet")
def list_parquet_files() -> dict:
    """List local snapshot Parquet files available for diagnostics."""
    files = []
    for name, path in _parquet_files().items():
        try:
            schema = pl.scan_parquet(path).collect_schema()
            files.append(
                {
                    "name": name,
                    "file": path.name,
                    "rows": _row_count(path),
                    "columns": list(schema.names()),
                    "dtypes": {column: str(dtype) for column, dtype in schema.items()},
                }
            )
        except Exception as exc:  # pragma: no cover - defensive diagnostics path
            files.append(
                {
                    "name": name,
                    "file": path.name,
                    "error": str(exc),
                }
            )

    return {"snapshot_dir": str(SNAPSHOTS_DIR), "files": files}


@router.get("/parquet/{name}")
def preview_parquet(
    name: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, min_length=1),
    column: str | None = Query(default=None),
) -> dict:
    """Preview an allowlisted local snapshot Parquet file."""
    files = _parquet_files()
    path = files.get(name)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown snapshot '{name}'. Available: {sorted(files)}",
        )

    try:
        schema = pl.scan_parquet(path).collect_schema()
        df = pl.read_parquet(path)
        search_columns = list(schema.names())

        if search:
            needle = search.lower()
            if column:
                if column not in search_columns:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown column '{column}'. Available: {search_columns}",
                    )
                filter_expr = (
                    pl.col(column)
                    .cast(pl.Utf8)
                    .fill_null("")
                    .str.to_lowercase()
                    .str.contains(needle, literal=True)
                )
            else:
                filter_expr = pl.any_horizontal(
                    [
                        pl.col(col)
                        .cast(pl.Utf8)
                        .fill_null("")
                        .str.to_lowercase()
                        .str.contains(needle, literal=True)
                        for col in search_columns
                    ]
                )
            df = df.filter(filter_expr)

        filtered_rows = df.height
        df = df.slice(offset, limit)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive diagnostics path
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "name": name,
        "file": path.name,
        "total_rows": _row_count(path),
        "filtered_rows": filtered_rows,
        "offset": offset,
        "limit": limit,
        "search": search,
        "column": column,
        "rows_returned": df.height,
        "columns": list(schema.names()),
        "dtypes": {column: str(dtype) for column, dtype in schema.items()},
        "data": df.to_dicts(),
    }
