"""Pydantic schemas — single source of truth for FastAPI + Instructor + frontend TS types."""

from .aggregates import BrandRollup, Pulse, SubChannelRollup, WorstSlice
from .anomaly import AnomalyEvent
from .chat import ChatMessage, ChatRequest
from .drivers import Driver
from .explain import ExplainViewRequest, ExplainViewSummary
from .external import ExternalSignals, RetailSignal, SearchSignal, WeatherSignal
from .forecast import CalendarEvent, ForecastPoint, ForecastSeries, PromoWindow
from .gap import GapItem, KpiSummary
from .meta import MetaResponse
from .pricing import GrossPriceRate
from .promos import PromoROI
from .recommend import RecommendationAction, RecommendationResponse, RecommendationScenario
from .simulate import SimulationRequest, SimulationResult

__all__ = [
    "AnomalyEvent",
    "BrandRollup",
    "CalendarEvent",
    "ChatMessage",
    "ChatRequest",
    "Driver",
    "ExplainViewRequest",
    "ExplainViewSummary",
    "ExternalSignals",
    "ForecastPoint",
    "ForecastSeries",
    "PromoWindow",
    "GapItem",
    "KpiSummary",
    "GrossPriceRate",
    "MetaResponse",
    "PromoROI",
    "Pulse",
    "RecommendationAction",
    "RecommendationResponse",
    "RecommendationScenario",
    "RetailSignal",
    "SearchSignal",
    "SimulationRequest",
    "SimulationResult",
    "SubChannelRollup",
    "WeatherSignal",
    "WorstSlice",
]
