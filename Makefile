# MarketPulse UK — dev ergonomics
#
# First time:   make first-run     (doctor + install + types)
# Every time:   make demo          (backend on :8000 + Next.js web on :3000)
#
# Everything else is a piece of the above — see `make help`.

SHELL := /bin/bash
PY    := PYTHONHASHSEED=42 uv run python   # deterministic anonymization

BE     := backend
FE     := web
PNPM   := pnpm

# ──────────────────────────────────────────────────────────────────────────────
# Top-level entry points
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "MarketPulse UK — common commands"
	@echo ""
	@echo "  make first-run    one-shot for a fresh clone (doctor + env + install + types)"
	@echo "  make demo         start backend + Next.js web together"
	@echo "  make doctor       check prereqs (HF, uv, pnpm, data, mongo)"
	@echo ""
	@echo "  make install      install backend + web deps"
	@echo "  make types        regenerate web/ TS types from live OpenAPI"
	@echo "  make data         run ETL (raw Excel → snapshots/*.parquet)"
	@echo "  make train        fit forecast ensemble + write snapshots"
	@echo ""
	@echo "  make backend      run FastAPI on :8000 only"
	@echo "  make web          run Next.js on :3000 only"
	@echo "  make clean        remove caches, build artifacts"
	@echo ""

# First-run for a teammate cloning the repo
.PHONY: first-run
first-run: env doctor install types
	@echo ""
	@echo "✅ first-run setup complete. Now: make demo"
	@echo ""

# Run both servers
.PHONY: demo
demo: install
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) -j2 backend web

# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: env
env:
	@if [ ! -f $(BE)/.env ]; then \
		cp .env.example $(BE)/.env && \
		echo "→ created $(BE)/.env from .env.example (fill in HF_TOKEN, or run \`hf auth login\`)"; \
	else \
		echo "→ $(BE)/.env already exists"; \
	fi

.PHONY: install install-be install-fe
install: install-be install-fe

install-be:
	cd $(BE) && uv sync

install-fe:
	cd $(FE) && $(PNPM) install --silent

.PHONY: doctor
doctor:
	@echo "→ HF CLI...";  command -v hf  >/dev/null && hf --version 2>&1   || echo "  ❌ install: brew install huggingface-cli"
	@echo "→ uv...";      command -v uv  >/dev/null && uv --version        || echo "  ❌ install: brew install uv"
	@echo "→ pnpm...";    command -v pnpm >/dev/null && pnpm --version     || echo "  ❌ install: brew install pnpm"
	@echo "→ HF token..."; \
		if [ -n "$$HF_TOKEN" ] || ([ -f $(BE)/.env ] && grep -q '^HF_TOKEN=hf_' $(BE)/.env); then \
			echo "  ✓ HF_TOKEN set in env or .env"; \
		elif [ -s ~/.cache/huggingface/token ]; then \
			echo "  ✓ token cached in ~/.cache/huggingface/token (from \`hf auth login\`)"; \
		else \
			echo "  ❌ no token — either set HF_TOKEN in $(BE)/.env or run \`hf auth login\`"; \
		fi
	@echo "→ libomp (LightGBM)..."; \
		test -f /opt/homebrew/opt/libomp/lib/libomp.dylib && echo "  ✓ libomp present" \
		|| echo "  ❌ install: brew install libomp  (LightGBM needs OpenMP on macOS)"
	@echo "→ raw data..."; \
		test -d $(BE)/app/data/raw && ls $(BE)/app/data/raw/*.xlsx 2>/dev/null | wc -l | awk '{ if ($$1==0) print "  ❌ no xlsx files — get them from your teammate"; else print "  ✓ " $$1 " xlsx file(s) present" }'
	@echo "→ MongoDB..."; nc -z localhost 27017 2>/dev/null && echo "  ✓ reachable on :27017" || echo "  ⚠️  optional — needed only once persistence lands"

# ──────────────────────────────────────────────────────────────────────────────
# Frontend types from live backend OpenAPI
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: types
types:
	@cd $(BE) && (uv run uvicorn app.main:app --port 8000 --log-level error &) ; sleep 1 ; \
	cd ../$(FE) && $(PNPM) exec openapi-typescript http://localhost:8000/openapi.json -o src/lib/api.gen.ts ; \
	pkill -f "uvicorn app.main:app --port 8000" 2>/dev/null || true

.PHONY: web-types
web-types: types  # alias — kept for clarity

# ──────────────────────────────────────────────────────────────────────────────
# Data + training (Phase 1+ will fill these in)
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: data train
data:
	cd $(BE) && $(PY) -m app.services.etl

train: data
	cd $(BE) && $(PY) -u -m app.services.forecast.train

# ──────────────────────────────────────────────────────────────────────────────
# Individual servers
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: backend web
backend:
	cd $(BE) && uv run uvicorn app.main:app --reload --port 8000

web:
	cd $(FE) && $(PNPM) dev

# ──────────────────────────────────────────────────────────────────────────────
# Housekeeping
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	find . -type d -name __pycache__       -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache       -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache       -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(FE)/.next $(FE)/out
	rm -rf $(BE)/app/data/cache/*.parquet
