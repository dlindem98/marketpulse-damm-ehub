"""Runtime filesystem paths.

Defaults keep local development unchanged, while environment variables let
Databricks Apps/Jobs read raw Excel files and snapshots from Unity Catalog
Volumes.
"""

from __future__ import annotations

import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = APP_ROOT.parent


def _dir_from_env(name: str, default: Path) -> Path:
    value = os.getenv(name)
    return Path(value).expanduser() if value else default


RAW_DIR = _dir_from_env("MARKETPULSE_RAW_DIR", APP_ROOT / "data" / "raw")
SNAPSHOTS_DIR = _dir_from_env("MARKETPULSE_SNAPSHOT_DIR", APP_ROOT / "data" / "snapshots")
CACHE_DIR = _dir_from_env("MARKETPULSE_CACHE_DIR", APP_ROOT / "data" / "cache")


def raw_path(filename: str) -> Path:
    return RAW_DIR / filename


def snapshot_path(filename: str) -> Path:
    return SNAPSHOTS_DIR / filename


def cache_path(*parts: str) -> Path:
    return CACHE_DIR.joinpath(*parts)
