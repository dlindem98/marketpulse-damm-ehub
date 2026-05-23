"""Pydantic schemas — single source of truth for FastAPI + Instructor + frontend TS types."""

from .anomaly import AnomalyEvent
from .chat import ChatMessage, ChatRequest
from .drivers import Driver
from .explain import ExplainViewRequest, ExplainViewSummary
from .forecast import CalendarEvent, ForecastPoint, ForecastSeries, PromoWindow
from .gap import GapItem, KpiSummary
from .meta import MetaResponse
from .promos import PromoROI
from .recommend import RecommendationAction, RecommendationResponse, RecommendationScenario
from .simulate import SimulationRequest, SimulationResult

__all__ = [
    "AnomalyEvent",
    "CalendarEvent",
    "ChatMessage",
    "ChatRequest",
    "Driver",
    "ExplainViewRequest",
    "ExplainViewSummary",
    "ForecastPoint",
    "ForecastSeries",
    "PromoWindow",
    "GapItem",
    "KpiSummary",
    "MetaResponse",
    "PromoROI",
    "RecommendationAction",
    "RecommendationResponse",
    "RecommendationScenario",
    "SimulationRequest",
    "SimulationResult",
]
