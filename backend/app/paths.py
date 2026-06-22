"""Runtime filesystem paths.

Defaults keep local development unchanged, while environment variables let
Databricks Apps/Jobs read raw Excel files and snapshots from Unity Catalog
Volumes.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

APP_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = APP_ROOT.parent

load_dotenv(BACKEND_ROOT / ".env")


def _dir_from_env(name: str, default: Path) -> Path:
    value = os.getenv(name)
    return Path(value).expanduser() if value else default


_volume_value = os.getenv("MARKETPULSE_VOLUME_DIR")
VOLUME_DIR = Path(_volume_value).expanduser() if _volume_value else None

RAW_DIR = _dir_from_env(
    "MARKETPULSE_RAW_DIR",
    VOLUME_DIR if VOLUME_DIR is not None else APP_ROOT / "data" / "raw",
)
SNAPSHOTS_DIR = _dir_from_env(
    "MARKETPULSE_SNAPSHOT_DIR",
    (VOLUME_DIR / "snapshots") if VOLUME_DIR is not None else APP_ROOT / "data" / "snapshots",
)
CACHE_DIR = _dir_from_env(
    "MARKETPULSE_CACHE_DIR",
    (VOLUME_DIR / "cache") if VOLUME_DIR is not None else APP_ROOT / "data" / "cache",
)
MODELS_DIR = _dir_from_env(
    "MARKETPULSE_MODELS_DIR",
    (VOLUME_DIR / "models") if VOLUME_DIR is not None else BACKEND_ROOT / "models",
)


def using_external_data_dir() -> bool:
    return any(
        os.getenv(name)
        for name in (
            "MARKETPULSE_VOLUME_DIR",
            "MARKETPULSE_RAW_DIR",
            "MARKETPULSE_SNAPSHOT_DIR",
            "MARKETPULSE_CACHE_DIR",
            "MARKETPULSE_MODELS_DIR",
        )
    )


def raw_path(filename: str) -> Path:
    return RAW_DIR / filename


def snapshot_path(filename: str) -> Path:
    return SNAPSHOTS_DIR / filename


def cache_path(*parts: str) -> Path:
    return CACHE_DIR.joinpath(*parts)
