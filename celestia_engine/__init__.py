"""celest.ia engine — multi-agent flight research platform.

Public entry points:
    from celestia_engine import Orchestrator, SearchRequest
    report = await Orchestrator.from_env().search(request)
"""

from .models import (
    Cabin,
    FareQuote,
    FlightOffer,
    PurchaseOption,
    Route,
    SearchReport,
    SearchRequest,
    Source,
)
from .agents.orchestrator import Orchestrator

__all__ = [
    "Cabin",
    "FareQuote",
    "FlightOffer",
    "Orchestrator",
    "PurchaseOption",
    "Route",
    "SearchReport",
    "SearchRequest",
    "Source",
]

__version__ = "1.0.0"
