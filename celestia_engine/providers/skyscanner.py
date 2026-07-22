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
from .base import ProviderError, ProviderNotConfigured, get_json

PARTNERS_URL = (
    "https://partners.api.skyscanner.net/apiservices/v3/flights/indicative/search"
)

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


def _rapid_headers(settings: Settings) -> dict:
    return {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": settings.rapidapi_sky_host,
    }


#: (host, IATA) -> (skyId, entityId) — resolvidos via searchAirport, 1x por processo.
_PLACE_CACHE: dict[tuple[str, str], tuple[str, str]] = {}

_CABIN_TO_RAPID = {
    Cabin.ECONOMY: "economy",
    Cabin.PREMIUM: "premium_economy",
    Cabin.BUSINESS: "business",
}


async def _resolve_place(settings: Settings, iata: str) -> tuple[str, str]:
    """sky-scrapper exige skyId + entityId numérico (via /searchAirport)."""
    host = settings.rapidapi_sky_host
    cached = _PLACE_CACHE.get((host, iata))
    if cached:
        return cached
    payload = await get_json(
        f"https://{host}/api/v1/flights/searchAirport",
        params={"query": iata, "locale": "pt-BR"},
        headers=_rapid_headers(settings),
        timeout_s=settings.http_timeout_s,
    )
    items = payload.get("data") or []
    chosen: tuple[str, str] | None = None
    for item in items:
        if not isinstance(item, dict):
            continue
        sky = item.get("skyId") or (item.get("navigation") or {}).get(
            "relevantFlightParams", {}
        ).get("skyId")
        entity = item.get("entityId") or (item.get("navigation") or {}).get("entityId")
        if sky and entity:
            if str(sky).upper() == iata:
                chosen = (str(sky), str(entity))
                break
            if chosen is None:
                chosen = (str(sky), str(entity))
    if not chosen:
        raise ProviderError(f"searchAirport não encontrou '{iata}' em {host}")
    _PLACE_CACHE[(host, iata)] = chosen
    return chosen


async def _quote_rapidapi(
    settings: Settings, route: Route, depart: date, cabin: Cabin
) -> list[FareQuote]:
    """Adaptador por host (RAPIDAPI_SKY_HOST) — cada wrapper tem contrato próprio."""
    host = settings.rapidapi_sky_host
    if "flights-sky" in host:
        # ntd119/flights-sky: 1 chamada, aceita IATA direto
        params = {
            "fromEntityId": route.origin,
            "toEntityId": route.destination,
            "departDate": depart.isoformat(),
            "cabinClass": _CABIN_TO_RAPID[cabin],
            "currency": "BRL",
            "market": "pt-BR",
        }
        payload = await get_json(
            f"https://{host}/flights/search-one-way",
            params=params,
            headers=_rapid_headers(settings),
            timeout_s=settings.http_timeout_s,
        )
        return parse_rapidapi_payload(payload, route, depart, cabin)

    # apiheya/sky-scrapper: 2 etapas — resolve skyId/entityId e busca
    origin_sky, origin_entity = await _resolve_place(settings, route.origin)
    dest_sky, dest_entity = await _resolve_place(settings, route.destination)
    params = {
        "originSkyId": origin_sky,
        "destinationSkyId": dest_sky,
        "originEntityId": origin_entity,
        "destinationEntityId": dest_entity,
        "date": depart.isoformat(),
        "cabinClass": _CABIN_TO_RAPID[cabin],
        "adults": "1",
        "sortBy": "best",
        "currency": "BRL",
        "market": "pt-BR",
        "countryCode": "BR",
    }
    payload = await get_json(
        f"https://{host}{settings.rapidapi_sky_endpoint}",
        params=params,
        headers=_rapid_headers(settings),
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
