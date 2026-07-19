"""Google Flights via RapidAPI "google-flights2" (DataCrawler) — pré-filtro.

Alternativa muito mais barata ao SerpApi para o mesmo papel (free 150 req/mês;
~US$13/mês para 40k). Usa a mesma RAPIDAPI_KEY das demais APIs do hub —
basta assinar a API em rapidapi.com/DataCrawler/api/google-flights2.
"""

from __future__ import annotations

from datetime import date, datetime

from ..config import Settings
from ..models import Cabin, FareQuote, Route, Source
from .base import ProviderNotConfigured, get_json

_CABIN_TO_GF = {
    Cabin.ECONOMY: "ECONOMY",
    Cabin.PREMIUM: "PREMIUM_ECONOMY",
    Cabin.BUSINESS: "BUSINESS",
}


async def quote(
    settings: Settings, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    if not settings.has_google_flights2():
        raise ProviderNotConfigured(
            "RAPIDAPI_KEY ausente — google-flights2 desativado"
        )
    params = {
        "departure_id": route.origin,
        "arrival_id": route.destination,
        "outbound_date": depart.isoformat(),
        "travel_class": _CABIN_TO_GF[cabin],
        "adults": "1",
        "currency": "BRL",
        "language_code": "pt-BR",
        "country_code": "BR",
        "search_type": "best",
    }
    payload = await get_json(
        f"https://{settings.gf2_host}{settings.gf2_endpoint}",
        params=params,
        headers={
            "X-RapidAPI-Key": settings.rapidapi_key,
            "X-RapidAPI-Host": settings.gf2_host,
        },
        timeout_s=settings.http_timeout_s,
    )
    return parse_payload(payload, route, depart, cabin)


def parse_payload(
    payload: dict, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    """Extract prices from google-flights2 responses.

    Known shape: {"status": true, "data": {"itineraries": {"topFlights": [...],
    "otherFlights": [...]}}} with a numeric "price" per itinerary. The parser
    also accepts flat lists under data to survive minor schema drift.
    """
    quotes: list[FareQuote] = []
    data = payload.get("data") or {}
    if isinstance(data, list):
        # variante achatada: {"data": [ {...}, ... ]}
        itineraries: object = data
    elif isinstance(data, dict):
        itineraries = data.get("itineraries") or {}
    else:
        return quotes
    buckets: list[list] = []
    if isinstance(itineraries, dict):
        buckets = [
            itineraries.get("topFlights") or [],
            itineraries.get("otherFlights") or [],
        ]
    elif isinstance(itineraries, list):
        buckets = [itineraries]

    for bucket in buckets:
        for item in bucket:
            if not isinstance(item, dict):
                continue
            price = item.get("price")
            if isinstance(price, dict):
                price = price.get("value") or price.get("raw") or price.get("amount")
            try:
                value = float(price)
            except (TypeError, ValueError):
                continue
            if value > 0:
                quotes.append(
                    FareQuote(
                        route=route,
                        depart=depart,
                        cabin=cabin,
                        price_brl=value,
                        source=Source.GOOGLE_FLIGHTS2,
                        fetched_at=datetime.utcnow(),
                    )
                )
    return quotes
