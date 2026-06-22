#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

BACKEND_PORT="${MARKETPULSE_BACKEND_PORT:-8000}"
APP_PORT="${DATABRICKS_APP_PORT:-3000}"

if [[ -n "${VIRTUAL_ENV:-}" && -x "${VIRTUAL_ENV}/bin/python" ]]; then
  PYTHON="${VIRTUAL_ENV}/bin/python"
elif [[ -x ".venv/bin/python" ]]; then
  PYTHON=".venv/bin/python"
elif [[ -x ".venv/bin/python3" ]]; then
  PYTHON=".venv/bin/python3"
else
  PYTHON="$(command -v python3 || command -v python)"
fi

export API_URL="${API_URL:-http://127.0.0.1:${BACKEND_PORT}}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"

echo "[marketpulse] start script v1"
echo "[marketpulse] python=${PYTHON}"
echo "[marketpulse] backend_port=${BACKEND_PORT} app_port=${APP_PORT}"

"${PYTHON}" - <<'PY'
import sys
import uvicorn
import polars

print(f"[marketpulse] python_version={sys.version.split()[0]}")
print(f"[marketpulse] uvicorn={uvicorn.__version__} polars={polars.__version__}")
PY

"${PYTHON}" -m uvicorn app.main:app \
  --app-dir backend \
  --host 127.0.0.1 \
  --port "${BACKEND_PORT}" &
BACKEND_PID=$!

cleanup() {
  kill "${BACKEND_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[marketpulse] waiting for backend health"
for _ in $(seq 1 60); do
  if "${PYTHON}" - <<PY >/dev/null 2>&1
from urllib.request import urlopen
urlopen("http://127.0.0.1:${BACKEND_PORT}/healthz", timeout=2).read()
PY
  then
    echo "[marketpulse] backend healthy"
    break
  fi
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "[marketpulse] backend exited before becoming healthy"
    wait "${BACKEND_PID}"
  fi
  sleep 1
done

if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
  echo "[marketpulse] backend is not running"
  exit 1
fi

npm --prefix web run start -- -p "${APP_PORT}" -H 0.0.0.0 &
FRONTEND_PID=$!

wait -n "${BACKEND_PID}" "${FRONTEND_PID}"
EXIT_CODE=$?
kill "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
exit "${EXIT_CODE}"
