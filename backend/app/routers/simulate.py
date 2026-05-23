"""POST /api/simulate — calls forecast.simulate.simulate() with the real LightGBM models."""

from fastapi import APIRouter

from app.schemas import SimulationRequest, SimulationResult
from app.services.forecast.simulate import simulate

router = APIRouter(prefix="/api", tags=["simulate"])


@router.post("/simulate", response_model=SimulationResult)
def post_simulate(req: SimulationRequest) -> SimulationResult:
    return simulate(req)
