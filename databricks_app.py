"""Databricks App launcher for MarketPulse.

Runs the FastAPI backend privately on localhost:8000 and exposes the Next.js
frontend on DATABRICKS_APP_PORT. Next proxies browser /api/* calls to the
private backend through web/next.config.ts.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
WEB = ROOT / "web"
BACKEND_PORT = os.getenv("MARKETPULSE_BACKEND_PORT", "8000")
APP_PORT = os.getenv("DATABRICKS_APP_PORT", "3000")
PYTHON = str(Path(sys.executable).resolve())
NPM = shutil.which("npm") or "npm"
LAUNCHER_VERSION = "2026-06-22-runtime-deps-v2"


def _spawn(name: str, command: list[str], cwd: Path, env: dict[str, str]) -> subprocess.Popen:
    print(f"[marketpulse] starting {name}: {' '.join(command)}", flush=True)
    return subprocess.Popen(command, cwd=cwd, env=env)


def _ensure_python_deps(env: dict[str, str]) -> None:
    try:
        import uvicorn  # noqa: F401
    except ModuleNotFoundError:
        print("[marketpulse] Python deps missing; installing requirements.txt", flush=True)
        install_env = env.copy()
        install_env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")
        subprocess.check_call(
            [PYTHON, "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")],
            cwd=ROOT,
            env=install_env,
        )


def _wait_for_backend(timeout_seconds: int = 60) -> None:
    deadline = time.time() + timeout_seconds
    url = f"http://127.0.0.1:{BACKEND_PORT}/healthz"
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"Backend did not become healthy at {url}")


def main() -> int:
    print(
        f"[marketpulse] launcher {LAUNCHER_VERSION} python={PYTHON} root={ROOT}",
        flush=True,
    )
    env = os.environ.copy()
    env.setdefault("API_URL", f"http://127.0.0.1:{BACKEND_PORT}")
    env.setdefault("NEXT_PUBLIC_API_URL", "/api")
    env.setdefault("HOSTNAME", "0.0.0.0")
    env.setdefault("PORT", APP_PORT)

    _ensure_python_deps(env)

    backend = _spawn(
        "backend",
        [
            PYTHON,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            BACKEND_PORT,
        ],
        BACKEND,
        env,
    )

    try:
        _wait_for_backend()
        frontend = _spawn(
            "frontend",
            [NPM, "run", "start", "--", "-p", APP_PORT, "-H", "0.0.0.0"],
            WEB,
            env,
        )

        children = [backend, frontend]

        def stop_children(signum: int, _frame: object) -> None:
            print(f"[marketpulse] received signal {signum}, stopping children", flush=True)
            for child in children:
                if child.poll() is None:
                    child.terminate()

        signal.signal(signal.SIGTERM, stop_children)
        signal.signal(signal.SIGINT, stop_children)

        while True:
            for child in children:
                code = child.poll()
                if code is not None:
                    for other in children:
                        if other is not child and other.poll() is None:
                            other.terminate()
                    return code
            time.sleep(1)
    except Exception as exc:
        print(f"[marketpulse] startup failed: {exc}", file=sys.stderr, flush=True)
        if backend.poll() is None:
            backend.terminate()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
