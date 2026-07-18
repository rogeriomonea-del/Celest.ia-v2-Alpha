"""Skyscanner como pré-filtro de preços indicativos.

Caminhos suportados (o primeiro configurado é usado):
1. Skyscanner Partners v3 "indicative prices" — SKYSCANNER_API_KEY
   (https://developers.skyscanner.net, requer aprovação de parceiro).
2. Fallback comunitário via RapidAPI — RAPIDAPI_KEY
   (ex.: hub "sky-scrapper" / equivalentes; endpoint configurável).
"""

from __future__ import annotations

from datetime import date, datetime

from ..config import Settings
from ..models import Cabin, FareQuote, Route, Source
from .base import ProviderNotConfigured, get_json

PARTNERS_URL = (
    "https://partners.api.skyscanner.net/apiservices/v3/flights/indicative/search"
)
RAPIDAPI_URL = "https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchFlights"
RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com"

_CABIN_TO_SKY = {
    Cabin.ECONOMY: "CABIN_CLASS_ECONOMY",
    Cabin.PREMIUM: "CABIN_CLASS_PREMIUM_ECONOMY",
    Cabin.BUSINESS: "CABIN_CLASS_BUSINESS",
}


async def quote(
    settings: Settings, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    if settings.skyscanner_api_key:
        return await _quote_partners(settings, route, depart, cabin)
    if settings.rapidapi_key:
        return await _quote_rapidapi(settings, route, depart, cabin)
    raise ProviderNotConfigured(
        "SKYSCANNER_API_KEY/RAPIDAPI_KEY ausentes — Skyscanner desativado"
    )


async def _quote_partners(
    settings: Settings, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    # v3 indicative aceita POST; muitos gateways de parceiros expõem GET
    # equivalente — mantemos GET com query serializada por simplicidade.
    params = {
        "market": "BR",
        "locale": "pt-BR",
        "currency": "BRL",
        "originPlace": route.origin,
        "destinationPlace": route.destination,
        "date": depart.isoformat(),
        "cabinClass": _CABIN_TO_SKY[cabin],
    }
    payload = await get_json(
        PARTNERS_URL,
        params=params,
        headers={"x-api-key": settings.skyscanner_api_key},
        timeout_s=settings.http_timeout_s,
    )
    return parse_partners_payload(payload, route, depart, cabin)


async def _quote_rapidapi(
    settings: Settings, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    params = {
        "originSkyId": route.origin,
        "destinationSkyId": route.destination,
        "date": depart.isoformat(),
        "cabinClass": cabin.value,
        "currency": "BRL",
        "market": "pt-BR",
    }
    payload = await get_json(
        RAPIDAPI_URL,
        params=params,
        headers={
            "X-RapidAPI-Key": settings.rapidapi_key,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
        timeout_s=settings.http_timeout_s,
    )
    return parse_rapidapi_payload(payload, route, depart, cabin)


def _mk_quote(route: Route, depart: date, cabin: Cabin, price: float) -> FareQuote:
    return FareQuote(
        route=route,
        depart=depart,
        cabin=cabin,
        price_brl=float(price),
        source=Source.SKYSCANNER,
        fetched_at=datetime.utcnow(),
    )


def parse_partners_payload(
    payload: dict, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    quotes: list[FareQuote] = []
    results = payload.get("content", {}).get("results", {})
    for item in (results.get("quotes") or {}).values():
        amount = (item.get("minPrice") or {}).get("amount")
        try:
            price = float(amount)
        except (TypeError, ValueError):
            continue
        if price > 0:
            quotes.append(_mk_quote(route, depart, cabin, price))
    return quotes


def parse_rapidapi_payload(
    payload: dict, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    quotes: list[FareQuote] = []
    itineraries = (payload.get("data") or {}).get("itineraries") or []
    for item in itineraries:
        raw = (item.get("price") or {}).get("raw")
        try:
            price = float(raw)
        except (TypeError, ValueError):
            continue
        if price > 0:
            quotes.append(_mk_quote(route, depart, cabin, price))
    return quotes
