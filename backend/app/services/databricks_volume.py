"""Sync Unity Catalog Volume files into the app container when needed.

Databricks Apps can authorize access to a UC Volume as an App resource, but the
`/Volumes/...` FUSE path is not always mounted inside the app container. The
Databricks Files API still accepts `/Volumes/...` paths, so we mirror the small
runtime artifacts we need into local disk and let the rest of the app keep using
normal `polars.read_parquet(...)` calls.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.paths import LOCAL_VOLUME_DIR, REMOTE_VOLUME_DIR, USE_LOCAL_VOLUME_MIRROR

log = logging.getLogger(__name__)

RUNTIME_DIRS = ("snapshots", "cache")


def _download_directory(client, remote_dir: str, local_dir: Path) -> int:
    local_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    try:
        entries = list(client.files.list_directory_contents(remote_dir))
    except Exception as exc:
        log.warning("Could not list Databricks volume directory %s: %s", remote_dir, exc)
        return downloaded

    for entry in entries:
        path = getattr(entry, "path", None)
        if not path:
            continue
        name = Path(path).name
        if not name:
            continue
        is_directory = bool(getattr(entry, "is_directory", False))
        if is_directory:
            downloaded += _download_directory(client, path, local_dir / name)
            continue
        destination = local_dir / name
        try:
            client.files.download_to(path, str(destination), overwrite=True)
            downloaded += 1
        except Exception as exc:
            log.warning("Could not download Databricks volume file %s: %s", path, exc)
    return downloaded


def sync_volume_to_local_if_needed() -> None:
    if not REMOTE_VOLUME_DIR or not USE_LOCAL_VOLUME_MIRROR:
        return

    try:
        from databricks.sdk import WorkspaceClient
    except Exception as exc:
        log.warning("databricks-sdk is unavailable; cannot mirror %s: %s", REMOTE_VOLUME_DIR, exc)
        print(f"[marketpulse] databricks-sdk unavailable; cannot mirror {REMOTE_VOLUME_DIR}: {exc}")
        return

    client = WorkspaceClient()
    print(f"[marketpulse] mirroring Databricks volume {REMOTE_VOLUME_DIR} -> {LOCAL_VOLUME_DIR}")
    log.info(
        "Mirroring Databricks volume %s to local app cache %s",
        REMOTE_VOLUME_DIR,
        LOCAL_VOLUME_DIR,
    )
    total = 0
    for dirname in RUNTIME_DIRS:
        total += _download_directory(
            client,
            f"{REMOTE_VOLUME_DIR.as_posix().rstrip('/')}/{dirname}",
            LOCAL_VOLUME_DIR / dirname,
        )
    log.info("Mirrored %s Databricks volume file(s)", total)
    print(f"[marketpulse] mirrored {total} Databricks volume file(s)")
