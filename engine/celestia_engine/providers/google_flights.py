"""Google Flights via SerpApi (engine=google_flights) — pré-filtro de preços.

Requer SERPAPI_KEY (https://serpapi.com). Cada chamada retorna preços
indicativos por itinerário, usados para ranquear candidatos antes do
scraping caro nas companhias.
"""

from __future__ import annotations

from datetime import date, datetime

from ..config import Settings
from ..models import Cabin, FareQuote, Route, Source
from .base import ProviderNotConfigured, get_json

SERPAPI_URL = "https://serpapi.com/search.json"

_CABIN_TO_CLASS = {Cabin.ECONOMY: "1", Cabin.PREMIUM: "2", Cabin.BUSINESS: "3"}


async def quote(
    settings: Settings, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    if not settings.has_google_flights():
        raise ProviderNotConfigured("SERPAPI_KEY ausente — Google Flights desativado")

    params = {
        "engine": "google_flights",
        "departure_id": route.origin,
        "arrival_id": route.destination,
        "outbound_date": depart.isoformat(),
        "type": "2",  # one-way; roundtrip handled per-leg by the orchestrator
        "travel_class": _CABIN_TO_CLASS[cabin],
        "currency": "BRL",
        "hl": "pt-br",
        "api_key": settings.serpapi_key,
    }
    payload = await get_json(SERPAPI_URL, params=params, timeout_s=settings.http_timeout_s)
    return parse_payload(payload, route, depart, cabin)


def parse_payload(
    payload: dict, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    quotes: list[FareQuote] = []
    for bucket in ("best_flights", "other_flights"):
        for item in payload.get(bucket, []) or []:
            price = item.get("price")
            if isinstance(price, (int, float)) and price > 0:
                quotes.append(
                    FareQuote(
                        route=route,
                        depart=depart,
                        cabin=cabin,
                        price_brl=float(price),
                        source=Source.GOOGLE_FLIGHTS,
                        fetched_at=datetime.utcnow(),
                    )
                )
    return quotes
