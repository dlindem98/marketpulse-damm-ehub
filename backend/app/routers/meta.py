import json
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from app.paths import snapshot_path
from app.schemas import MetaResponse

router = APIRouter(prefix="/api", tags=["meta"])

META_PATH = snapshot_path("meta.json")


@lru_cache(maxsize=1)
def _load_meta() -> dict:
    if not META_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail="ETL not yet run — execute `make data` to produce meta.json.",
        )
    return json.loads(META_PATH.read_text())


@router.get("/meta", response_model=MetaResponse)
def get_meta() -> MetaResponse:
    """Filter values for the topbar — read directly from the ETL output."""
    m = _load_meta()
    return MetaResponse(
        brands=m["brands"],
        skus=m["skus"],
        sub_channels=m["sub_channels"],
        sub_channels_labeled=m.get("sub_channels_labeled", []),
        sales_channels=m["sales_channels"],
        sales_channels_labeled=m.get("sales_channels_labeled", []),
        period_range=tuple(m["period_range"]),
        hero=m["hero"],
    )
