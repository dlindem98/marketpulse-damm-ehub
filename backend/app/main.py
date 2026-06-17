"""MarketPulse UK — FastAPI entry point.

Mounts every router under `/api/*`. Endpoint contracts and the OpenAPI
schema flow to the Next.js frontend via `make types` (see README).
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.paths import SNAPSHOTS_DIR
from app.routers import (
    aggregates,
    brief,
    debug_data,
    drivers,
    explain_view,
    external,
    forecast,
    gap,
    meta,
    news,
    plays,
    pricing,
    promos,
    simulate,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Cold-start: warm meta cache, verify snapshot dir exists, etc.
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="MarketPulse UK",
    description="Damm × Engineering Hub Hackathon — forecasting & commercial recommendations",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers (one per endpoint family — keeps the file map clean)
app.include_router(meta.router)
app.include_router(forecast.router)
app.include_router(gap.router)
app.include_router(drivers.router)
app.include_router(simulate.router)
app.include_router(promos.router)
app.include_router(plays.router)
app.include_router(explain_view.router)
app.include_router(debug_data.router)
app.include_router(aggregates.router)
app.include_router(news.router)
app.include_router(brief.router)
app.include_router(external.router)
app.include_router(pricing.router)


@app.get("/", include_in_schema=False)
def root():
    return {
        "service": "marketpulse-uk",
        "status": "ok",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


@app.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True}
