%pip install -e /Workspace/Users/dlindem@damm.com/marketpulse-damm-ehub/backend
dbutils.library.restartPython()

import os
import sys
import subprocess
from pathlib import Path

REPO = Path("/Workspace/Users/dlindem@damm.com/marketpulse-damm-ehub")
BACKEND = REPO / "backend"

os.environ["MARKETPULSE_RAW_DIR"] = "/Volumes/damm_bronze_des/marketpulse-uk/marketpulse-uk"
os.environ["MARKETPULSE_SNAPSHOT_DIR"] = "/Volumes/damm_bronze_des/marketpulse-uk/marketpulse-uk/snapshots"
os.environ["MARKETPULSE_CACHE_DIR"] = "/Volumes/damm_bronze_des/marketpulse-uk/marketpulse-uk/cache"
os.environ["MARKETPULSE_MODELS_DIR"] = "/Volumes/damm_bronze_des/marketpulse-uk/marketpulse-uk/models"

subprocess.run(
    [sys.executable, "-m", "app.services.etl"],
    cwd=BACKEND,
    check=True,
)

subprocess.run(
    [sys.executable, "-m", "app.services.forecast.train"],
    cwd=BACKEND,
    check=True,
)

