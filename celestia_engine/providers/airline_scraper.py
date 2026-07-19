"""Scraping real das companhias via Playwright (Chromium headless).

Estratégia: abrir a página de busca da companhia e interceptar as respostas
JSON que o próprio site consome (availability/offers). É mais estável do que
raspar HTML e sobrevive a mudanças de layout — mas continua sujeito a
bot-protection; por isso todo erro vira ProviderError com contexto, e o
orquestrador degrada para os preços do pré-filtro.

Os templates de URL ficam em Settings (COPA_BOOKING_URL / LATAM_OFFERS_URL)
para acompanhar mudanças dos sites sem tocar em código.
"""

from __future__ import annotations

import asyncio
import json
from datetime import date
from typing import Any

from ..config import Settings
from ..models import Cabin, FlightOffer, Route, Source
from .base import ProviderError

#: substrings of XHR/fetch URLs that carry pricing payloads on each site.
PRICING_URL_HINTS: dict[str, tuple[str, ...]] = {
    "copa": ("availability", "shopping", "offers", "flightsearch"),
    "latam": ("air-offers", "offers", "availability", "itineraries"),
}


def _first_number(node: Any, keys: tuple[str, ...]) -> float | None:
    """Depth-first search for the first positive number under any of ``keys``."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key.lower() in keys and isinstance(value, (int, float)) and value > 0:
                return float(value)
        for value in node.values():
            found = _first_number(value, keys)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _first_number(value, keys)
            if found is not None:
                return found
    return None


def _collect_offers_nodes(node: Any, out: list[dict]) -> None:
    """Collect dict nodes that look like priced itineraries."""
    if isinstance(node, dict):
        keys = {k.lower() for k in node.keys()}
        if keys & {"price", "totalprice", "amount", "fareamount"} and (
            keys & {"flight", "flights", "segments", "itinerary", "flightnumber", "legs"}
        ):
            out.append(node)
        for value in node.values():
            _collect_offers_nodes(value, out)
    elif isinstance(node, list):
        for value in node:
            _collect_offers_nodes(value, out)


def parse_airline_payload(
    payload: dict,
    *,
    carrier: str,
    program: str,
    route: Route,
    depart: date,
    cabin: Cabin,
    source: Source,
) -> list[FlightOffer]:
    """Best-effort extraction of offers from an airline pricing payload.

    Airline JSON shapes change; this parser looks for itinerary-like nodes and
    pulls cash price, miles price, taxes and flight numbers defensively. It is
    unit-tested against bundled fixtures mirroring both sites' payloads.
    """
    nodes: list[dict] = []
    _collect_offers_nodes(payload, nodes)
    offers: list[FlightOffer] = []
    for node in nodes:
        cash = _first_number(node, ("price", "totalprice", "amount", "fareamount", "total"))
        miles = _first_number(node, ("miles", "milesamount", "points", "award"))
        taxes = _first_number(node, ("taxes", "tax", "fees", "taxamount")) or 0.0
        numbers = _extract_flight_numbers(node, carrier)
        if cash is None and miles is None:
            continue
        offers.append(
            FlightOffer(
                carrier=carrier,
                flight_numbers=numbers or (f"{carrier} ?",),
                origin=route.origin,
                destination=route.destination,
                depart=depart,
                cabin=cabin,
                price_cash_brl=cash,
                taxes_brl=float(taxes),
                price_miles=int(miles) if miles else None,
                miles_program=program if miles else None,
                source=source,
                raw={"node_keys": sorted(node.keys())[:12]},
            )
        )
    return offers


def _extract_flight_numbers(node: Any, carrier: str) -> tuple[str, ...]:
    found: list[str] = []

    def walk(item: Any) -> None:
        if isinstance(item, dict):
            for key, value in item.items():
                if key.lower() in {"flightnumber", "flight_number", "number"} and isinstance(
                    value, (str, int)
                ):
                    text = str(value)
                    found.append(text if text.upper().startswith(carrier) else f"{carrier} {text}")
                else:
                    walk(value)
        elif isinstance(item, list):
            for value in item:
                walk(value)

    walk(node)
    # preserve order, dedupe
    return tuple(dict.fromkeys(found))


async def scrape_airline(
    settings: Settings,
    *,
    site: str,  # "copa" | "latam"
    route: Route,
    depart: date,
    cabin: Cabin,
) -> list[FlightOffer]:
    """Drive the airline site in Chromium and harvest pricing JSON responses."""
    try:
        from playwright.async_api import async_playwright
    except ImportError as error:  # pragma: no cover - env without playwright
        raise ProviderError(
            "playwright não instalado — rode: pip install playwright && playwright install chromium"
        ) from error

    if site == "copa":
        carrier, program, source = "CM", "connectmiles", Source.COPA
        url = settings.copa_booking_url
    else:
        carrier, program, source = "LA", "latampass", Source.LATAM
        url = settings.latam_offers_url

    target = url.format(
        origin=route.origin,
        destination=route.destination,
        date=depart.isoformat(),
        adults=1,
        cabin=cabin.value.capitalize(),  # LATAM espera "Economy"/"Business"
    )
    hints = PRICING_URL_HINTS[site]
    payloads: list[dict] = []

    async def on_response(response) -> None:
        try:
            if any(h in response.url.lower() for h in hints) and "json" in (
                response.headers.get("content-type") or ""
            ):
                body = await response.text()
                payloads.append(json.loads(body))
        except Exception:  # noqa: BLE001 - never let a bad response kill the page
            return

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=settings.scraper_headless)
            page = await browser.new_page()
            page.on("response", lambda r: asyncio.create_task(on_response(r)))
            await page.goto(target, timeout=settings.scraper_timeout_ms, wait_until="domcontentloaded")
            await page.wait_for_timeout(min(settings.scraper_timeout_ms, 15_000))
            await browser.close()
    except Exception as error:  # noqa: BLE001 - normalize any playwright failure
        raise ProviderError(f"scrape {site} {route.key()} falhou: {error}") from error

    offers: list[FlightOffer] = []
    for payload in payloads:
        offers.extend(
            parse_airline_payload(
                payload,
                carrier=carrier,
                program=program,
                route=route,
                depart=depart,
                cabin=cabin,
                source=source,
            )
        )
    if not offers:
        raise ProviderError(
            f"scrape {site} {route.key()}: nenhuma resposta de preço interceptada "
            "(possível bot-protection ou URL desatualizada — ajuste no .env)"
        )
    return offers
