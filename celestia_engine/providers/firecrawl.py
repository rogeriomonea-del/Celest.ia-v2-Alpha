"""Scraping gerenciado via Firecrawl (https://firecrawl.dev).

Com FIRECRAWL_API_KEY configurada, o scraping das companhias usa o Firecrawl:
proxies, browsers e evasão de anti-bot gerenciados pelo serviço, e a extração
já volta ESTRUTURADA (passamos um JSON Schema + prompt). O Playwright local
vira fallback automático quando o Firecrawl falha ou não está configurado.
"""

from __future__ import annotations

from datetime import date

from ..config import Settings
from ..models import Cabin, FlightOffer, Route, Source
from .base import ProviderError, ProviderNotConfigured, post_json

#: Schema que o Firecrawl usa para extrair ofertas da página renderizada.
EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "offers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "flight_numbers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Números dos voos do itinerário, ex.: ['CM 702']",
                    },
                    "price_cash_brl": {
                        "type": "number",
                        "description": "Preço total em dinheiro (BRL), com taxas",
                    },
                    "taxes_brl": {
                        "type": "number",
                        "description": "Taxas e encargos em BRL",
                    },
                    "price_miles": {
                        "type": "integer",
                        "description": "Preço em milhas do programa de fidelidade, se exibido",
                    },
                    "seats_left": {
                        "type": "integer",
                        "description": "Assentos restantes, se exibido",
                    },
                },
            },
        }
    },
    "required": ["offers"],
}

EXTRACTION_PROMPT = (
    "Extraia todas as ofertas de voo visíveis na página de resultados: números "
    "de voo, preço total em reais (BRL), taxas, preço em milhas do programa de "
    "fidelidade (se houver) e assentos restantes (se houver)."
)

_SITE_META = {
    "copa": ("CM", "connectmiles", Source.COPA),
    "latam": ("LA", "latampass", Source.LATAM),
}


async def scrape(
    settings: Settings,
    *,
    site: str,
    route: Route,
    depart: date,
    cabin: Cabin,
) -> list[FlightOffer]:
    if not settings.has_firecrawl():
        raise ProviderNotConfigured("FIRECRAWL_API_KEY ausente — Firecrawl desativado")

    carrier, program, source = _SITE_META[site]
    template = settings.copa_booking_url if site == "copa" else settings.latam_offers_url
    target = template.format(
        origin=route.origin,
        destination=route.destination,
        date=depart.isoformat(),
        adults=1,
        cabin=cabin.value,
    )
    body = {
        "url": target,
        "formats": ["json"],
        "jsonOptions": {"schema": EXTRACTION_SCHEMA, "prompt": EXTRACTION_PROMPT},
        "waitFor": 8_000,
        "timeout": settings.scraper_timeout_ms,
    }
    payload = await post_json(
        settings.firecrawl_api_url,
        json_body=body,
        headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"},
        timeout_s=max(settings.http_timeout_s, settings.scraper_timeout_ms / 1000 + 10),
        retries=2,  # scrape é caro/lento — 2 tentativas bastam antes do fallback
    )
    offers = parse_firecrawl_payload(
        payload,
        carrier=carrier,
        program=program,
        route=route,
        depart=depart,
        cabin=cabin,
        source=source,
    )
    if not offers:
        raise ProviderError(
            f"firecrawl {site} {route.key()}: extração vazia "
            "(página sem resultados ou schema não casou)"
        )
    return offers


def parse_firecrawl_payload(
    payload: dict,
    *,
    carrier: str,
    program: str,
    route: Route,
    depart: date,
    cabin: Cabin,
    source: Source,
) -> list[FlightOffer]:
    if payload.get("success") is False:
        raise ProviderError(f"firecrawl retornou erro: {payload.get('error', 'desconhecido')}")

    extracted = (payload.get("data") or {}).get("json") or {}
    offers: list[FlightOffer] = []
    for item in extracted.get("offers") or []:
        if not isinstance(item, dict):
            continue
        cash = item.get("price_cash_brl")
        miles = item.get("price_miles")
        if not cash and not miles:
            continue
        numbers = tuple(
            number if str(number).upper().startswith(carrier) else f"{carrier} {number}"
            for number in (item.get("flight_numbers") or [])
            if str(number).strip()
        )
        offers.append(
            FlightOffer(
                carrier=carrier,
                flight_numbers=numbers or (f"{carrier} ?",),
                origin=route.origin,
                destination=route.destination,
                depart=depart,
                cabin=cabin,
                price_cash_brl=float(cash) if cash else None,
                taxes_brl=float(item.get("taxes_brl") or 0.0),
                price_miles=int(miles) if miles else None,
                miles_program=program if miles else None,
                seats_left=int(item["seats_left"]) if item.get("seats_left") else None,
                source=source,
                raw={"via": "firecrawl"},
            )
        )
    return offers
