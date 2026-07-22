"""Google Flights via RapidAPI "google-flights2" (DataCrawler) — pré-filtro.

Alternativa muito mais barata ao SerpApi para o mesmo papel (free 150 req/mês;
~US$13/mês para 40k). Usa a mesma RAPIDAPI_KEY das demais APIs do hub —
basta assinar a API em rapidapi.com/DataCrawler/api/google-flights2.
"""

from __future__ import annotations

import re
from datetime import date, datetime

from ..airlines import resolve_carrier_label
from ..config import Settings
from ..models import Cabin, FareQuote, FlightOffer, Route, Source
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


async def quote_rich(
    settings: Settings, route: Route, depart: date, cabin: Cabin, top_n: int = 8
) -> tuple[list[FareQuote], list[FlightOffer]]:
    """UMA chamada paga, dois produtos: cotações (pré-filtro) + voos ricos.

    Antes o parser descartava companhia, horários e escalas de cada itinerário
    e guardava só o preço. Agora a mesma resposta vira também FlightOffers de
    metasearch (marcados ``indicative``) — mais opções por pesquisa sem gastar
    mais nenhuma chamada.
    """
    if not settings.has_google_flights2():
        raise ProviderNotConfigured("RAPIDAPI_KEY ausente — google-flights2 desativado")
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
    return (
        parse_payload(payload, route, depart, cabin),
        parse_metasearch_offers(payload, route, depart, cabin, top_n=top_n),
    )


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
            value = _price_of(item)
            if value is not None:
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


# ------------------------------------------------------- extração rica (premium)
def _price_of(item: dict) -> float | None:
    price = item.get("price")
    if isinstance(price, dict):
        price = (
            price.get("value") or price.get("raw") or price.get("amount")
            or price.get("text")
        )
    # tolera "R$ 1.562", "1,562.00" etc. — mesmo normalizador do Interact
    from .firecrawl_interact import money_number

    value = money_number(price)
    return value if value is not None and value > 0 else None


def _duration_min(value) -> int:
    if isinstance(value, dict):
        value = value.get("raw") or value.get("value") or value.get("text")
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    if isinstance(value, str):
        match = re.search(r"(\d+)\s*h(?:\s*(\d+))?", value)
        if match:
            return int(match.group(1)) * 60 + int(match.group(2) or 0)
        if value.isdigit():
            return int(value)
    return 0


def _time_of(item: dict, *keys: str) -> str | None:
    for key in keys:
        raw = item.get(key)
        if isinstance(raw, str) and raw.strip():
            match = re.search(r"(\d{1,2}):(\d{2})(?:\s*(AM|PM))?", raw, re.IGNORECASE)
            if match:
                hour, minute = int(match.group(1)), match.group(2)
                meridian = (match.group(3) or "").upper()
                if meridian == "PM" and hour < 12:
                    hour += 12
                if meridian == "AM" and hour == 12:
                    hour = 0
                return f"{hour:02d}:{minute}"
    return None


def _segments_of(item: dict) -> list[dict]:
    segments = item.get("flights") or item.get("segments") or []
    return [s for s in segments if isinstance(s, dict)]


def _layovers_of(item: dict) -> list[dict]:
    out = []
    for layover in item.get("layovers") or []:
        if not isinstance(layover, dict):
            continue
        airport = str(
            layover.get("id") or layover.get("airport") or layover.get("code") or ""
        ).strip().upper()
        if airport:
            out.append(
                {"airport": airport, "minutes": _duration_min(
                    layover.get("duration") or layover.get("minutes"))}
            )
    return out


def parse_metasearch_offers(
    payload: dict, route: Route, depart: date, cabin: Cabin, *, top_n: int = 8
) -> list[FlightOffer]:
    """Itinerários completos da resposta do gf2 → FlightOffers indicativos.

    Extrai companhia(s), números de voo, horários, duração e escalas de cada
    itinerário — os dados que antes eram jogados fora. Tolerante a variações
    de esquema (chaves alternativas); só o preço é obrigatório.
    """
    data = payload.get("data") or {}
    if isinstance(data, list):
        buckets: list[list] = [data]
    elif isinstance(data, dict):
        itineraries = data.get("itineraries") or {}
        if isinstance(itineraries, dict):
            buckets = [itineraries.get("topFlights") or [], itineraries.get("otherFlights") or []]
        elif isinstance(itineraries, list):
            buckets = [itineraries]
        else:
            buckets = []
    else:
        return []

    offers: list[FlightOffer] = []
    for bucket in buckets:
        for item in bucket:
            if len(offers) >= max(1, top_n):
                break
            if not isinstance(item, dict):
                continue
            price = _price_of(item)
            if price is None:
                continue
            segments = _segments_of(item)
            labels = [
                str(s.get("airline") or s.get("airline_name") or "").strip()
                for s in segments
            ]
            label = next((l for l in labels if l), str(item.get("airline") or "")) or "Google Flights"
            numbers = tuple(
                str(s.get("flight_number") or s.get("flightNumber") or "").strip()
                for s in segments
                if str(s.get("flight_number") or s.get("flightNumber") or "").strip()
            )
            layovers = _layovers_of(item)
            stops = item.get("stops")
            if not isinstance(stops, int):
                stops = len(layovers) if layovers else max(0, len(segments) - 1)
            carrier_code = resolve_carrier_label(label, "*")
            if carrier_code == "*" and numbers:
                # rótulo desconhecido: deriva o código do prefixo do número do
                # voo ("DT 747" → DT) — sem isto a companhia nunca chega ao
                # airlines_discovered.csv e o aprendizado da malha fica cego
                match = re.match(r"([A-Z][A-Z0-9]|[0-9][A-Z])\s*\d", numbers[0].upper())
                if match:
                    carrier_code = match.group(1)
            offers.append(
                FlightOffer(
                    carrier=carrier_code,
                    flight_numbers=numbers or (f"{route.origin}-{route.destination}",),
                    origin=route.origin,
                    destination=route.destination,
                    depart=depart,
                    cabin=cabin,
                    price_cash_brl=round(price, 2),
                    source=Source.GOOGLE_FLIGHTS2,
                    raw={
                        "via": "google_flights2",
                        "indicative": True,
                        "airline_label": label,
                        "departure_time": _time_of(item, "departure_time", "departureTime"),
                        "arrival_time": _time_of(item, "arrival_time", "arrivalTime"),
                        "duration_min": _duration_min(item.get("duration")),
                        "stops": stops,
                        "layovers": layovers,
                    },
                )
            )
    return offers
