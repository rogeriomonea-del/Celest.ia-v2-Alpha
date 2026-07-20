"""Firecrawl Interact — controla a página de busca ao vivo (sessão de browser).

Diferente do /v1/scrape estático (que só lê o HTML inicial, vazio nos sites
SPA das companhias), o modo Interact abre uma sessão viva e encadeia passos em
linguagem natural para preencher o formulário e extrair as tarifas — de várias
companhias de uma vez (metasearch da própria companhia/agência).

Fluxo (conforme o playbook validado):
    1) POST {base}/v2/scrape {url}                 -> scrapeId (abre a sessão)
    2) POST {base}/v2/scrape/{id}/interact {prompt} -> encadeia passos
    3) DELETE {base}/v2/scrape/{id}/interact         -> encerra a sessão

Reutiliza o MESMO scrapeId em todos os passos (economiza créditos) e sempre
encerra a sessão no fim, mesmo em erro.
"""

from __future__ import annotations

import json
import re
from datetime import date

from ..config import Settings
from ..models import Cabin, DatePrice, FlightOffer, Route, Source
from .base import ProviderError, ProviderNotConfigured, post_json

# empresa/programa/fonte por site
_SITE_META = {
    "copa": ("CM", "connectmiles", Source.COPA),
    "latam": ("LA", "latampass", Source.LATAM),
}

_CABIN_WORD = {Cabin.ECONOMY: "Econômica", Cabin.PREMIUM: "Premium", Cabin.BUSINESS: "Executiva"}

_EXTRACT_INSTRUCTION = (
    "Extraia TODAS as tarifas visíveis nos resultados e responda APENAS com um "
    "JSON válido, sem texto ao redor, no formato: "
    '{"offers":[{"airline":"COPA","flight_numbers":["CM 702"],'
    '"cabin":"economy","price":1226,"currency":"USD",'
    '"departure_time":"01:40","duration_minutes":680,"stops":1}]}. '
    "cabin deve ser 'economy' ou 'business'. currency é o código ISO (USD/BRL). "
    "Se um campo não existir, use null."
)


async def _headers(settings: Settings) -> dict:
    return {"Authorization": f"Bearer {settings.firecrawl_api_key}"}


async def open_session(settings: Settings, url: str) -> str:
    payload = await post_json(
        f"{settings.firecrawl_api_base}/v2/scrape",
        json_body={"url": url},
        headers=await _headers(settings),
        timeout_s=max(settings.http_timeout_s, 40),
        retries=2,
    )
    # metadata pode vir ausente OU explicitamente null — dict.get(k, {}) só
    # protege o primeiro caso, então normalizamos para {} defensivamente.
    meta = (payload.get("data") or {}).get("metadata") or {}
    scrape_id = meta.get("scrapeId") or meta.get("scrape_id")
    if not scrape_id:
        raise ProviderError("firecrawl interact: /v2/scrape não retornou scrapeId")
    return scrape_id


async def interact(settings: Settings, scrape_id: str, prompt: str) -> str:
    payload = await post_json(
        f"{settings.firecrawl_api_base}/v2/scrape/{scrape_id}/interact",
        json_body={"prompt": prompt},
        headers=await _headers(settings),
        timeout_s=max(settings.http_timeout_s, 60),
        retries=1,
    )
    data = payload.get("data") or payload
    return str(data.get("output") or data.get("result") or "")


async def close_session(settings: Settings, scrape_id: str) -> None:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.delete(
                f"{settings.firecrawl_api_base}/v2/scrape/{scrape_id}/interact",
                headers=await _headers(settings),
            )
    except Exception:  # noqa: BLE001 - encerrar é best-effort
        return


async def scrape_flights(
    settings: Settings, *, site: str, route: Route, depart: date
) -> list[FlightOffer]:
    """Estratégia firecrawl_interact: retorna ofertas de TODAS as cabines."""
    if not settings.has_firecrawl():
        raise ProviderNotConfigured("FIRECRAWL_API_KEY ausente — Interact desativado")
    if not settings.firecrawl_interact_enabled:
        raise ProviderNotConfigured("FIRECRAWL_INTERACT=0 — modo Interact desativado")

    carrier, program, source = _SITE_META[site]
    url = settings.copa_interact_url if site == "copa" else settings.latam_interact_url
    depart_br = f"{depart.day:02d}/{depart.month:02d}/{depart.year}"

    scrape_id = await open_session(settings, url)
    try:
        await interact(
            settings,
            scrape_id,
            f"1. No campo de origem digite {route.origin}. "
            f"2. No campo de destino digite {route.destination}. "
            "Selecione a primeira sugestão de cada campo.",
        )
        await interact(
            settings,
            scrape_id,
            f"Defina somente ida com data de partida {depart_br}. "
            "Confirme 1 adulto e pesquise os voos.",
        )
        raw_output = await interact(
            settings,
            scrape_id,
            "Aguarde os resultados carregarem. " + _EXTRACT_INSTRUCTION,
        )
    finally:
        await close_session(settings, scrape_id)

    offers = parse_interact_output(
        raw_output,
        carrier=carrier,
        program=program,
        route=route,
        depart=depart,
        source=source,
        usd_brl_rate=settings.usd_brl_rate,
    )
    if not offers:
        raise ProviderError(
            f"firecrawl interact {site} {route.key()}: extração vazia "
            f"(output: {raw_output[:120]!r})"
        )
    return offers


_CABIN_GF = {Cabin.ECONOMY: "Econômica", Cabin.PREMIUM: "Premium", Cabin.BUSINESS: "Executiva"}


async def scan_calendar(
    settings: Settings,
    *,
    origin: str,
    destination: str,
    cabin: Cabin,
    start,
    end,
) -> list[DatePrice]:
    """Lê o calendário de preços do Google Flights numa janela de datas.

    Uma única sessão Interact abre o Google Flights, define rota/classe e o
    intervalo amplo, e extrai o preço de cada data disponível. Serve para
    CORTAR datas caras antes de gastar scraping — a saída alimenta o
    FlexDateScoutAgent, que escolhe as datas mais baratas para raspar.
    """
    if not settings.has_firecrawl():
        raise ProviderNotConfigured("FIRECRAWL_API_KEY ausente — scan de calendário desativado")
    if not settings.firecrawl_interact_enabled:
        raise ProviderNotConfigured("FIRECRAWL_INTERACT=0 — scan de calendário desativado")

    scrape_id = await open_session(settings, settings.google_flights_interact_url)
    try:
        await interact(
            settings,
            scrape_id,
            f"1. Selecione 'Somente ida'. 2. Origem {origin}, destino {destination}. "
            f"3. Classe {_CABIN_GF[cabin]}. Selecione a primeira sugestão de cada campo.",
        )
        raw = await interact(
            settings,
            scrape_id,
            "Abra o seletor de datas / calendário de preços e leia os preços por data. "
            f"Considere apenas datas entre {start.isoformat()} e {end.isoformat()}. "
            "Responda APENAS com JSON válido no formato "
            '{"calendar":[{"date":"2026-09-20","price":1562,"currency":"BRL"}]}. '
            "currency é o código ISO (BRL/USD). Não invente datas sem preço.",
        )
    finally:
        await close_session(settings, scrape_id)

    return parse_calendar_output(raw, usd_brl_rate=settings.usd_brl_rate)


def _parse_cal_date(raw: str):
    """Aceita ISO (2026-09-20) e o formato BR (20/09/2026) que o Google Flights
    pt-BR pode devolver; retorna None se não reconhecer."""
    from datetime import date as _date

    raw = raw.strip()
    try:
        return _date.fromisoformat(raw[:10])
    except ValueError:
        pass
    match = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if match:
        day, month, year = (int(part) for part in match.groups())
        try:
            return _date(year, month, day)
        except ValueError:
            return None
    return None


def parse_calendar_output(text: str, *, usd_brl_rate: float) -> list[DatePrice]:
    obj = _find_json(text, key="calendar")
    if not obj:
        return []
    out: list[DatePrice] = []
    for item in obj.get("calendar") or []:
        if not isinstance(item, dict):
            continue
        parsed = _parse_cal_date(str(item.get("date") or ""))
        if parsed is None:
            continue
        try:
            price = float(item.get("price"))
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        currency = str(item.get("currency") or "BRL").upper()
        price_brl = round(price * usd_brl_rate, 2) if currency == "USD" else round(price, 2)
        out.append(DatePrice(date=parsed, price_brl=price_brl, source=Source.GOOGLE_FLIGHTS))
    return out


def _find_json(text: str, key: str = "offers") -> dict | None:
    """Extrai o primeiro objeto JSON que contém `key` (tolera cercas ```)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidates = []
    if fenced:
        candidates.append(fenced.group(1))
    # primeiro { ... } balanceado por varredura
    start = text.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start : i + 1])
                    break
        start = text.find("{", start + 1)
        if len(candidates) > 6:
            break
    for candidate in candidates:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict) and key in obj:
                return obj
        except (ValueError, TypeError):
            continue
    return None


def _parse_duration(value) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    if isinstance(value, str):
        match = re.search(r"(\d+)\s*h(?:\s*(\d+))?", value)
        if match:
            return int(match.group(1)) * 60 + int(match.group(2) or 0)
    return 0


def parse_interact_output(
    text: str,
    *,
    carrier: str,
    program: str,
    route: Route,
    depart: date,
    source: Source,
    usd_brl_rate: float,
) -> list[FlightOffer]:
    obj = _find_json(text)
    if not obj:
        return []
    offers: list[FlightOffer] = []
    for item in obj.get("offers") or []:
        if not isinstance(item, dict):
            continue
        price = item.get("price")
        try:
            price = float(price)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        currency = str(item.get("currency") or "BRL").upper()
        price_brl = round(price * usd_brl_rate, 2) if currency == "USD" else round(price, 2)
        cabin = (
            Cabin.BUSINESS
            if str(item.get("cabin", "")).lower().startswith(("business", "exec"))
            else Cabin.ECONOMY
        )
        # o LLM pode devolver flight_numbers como string em vez de array; sem
        # normalizar, iterar uma string explode em caracteres soltos.
        raw_numbers = item.get("flight_numbers")
        if isinstance(raw_numbers, str):
            raw_numbers = [raw_numbers]
        numbers = tuple(
            str(n) for n in (raw_numbers or []) if str(n).strip()
        ) or (f"{carrier} ?",)
        airline = str(item.get("airline") or carrier)
        offers.append(
            FlightOffer(
                carrier=carrier if airline.upper().startswith(carrier) else _carrier_of(airline, carrier),
                flight_numbers=numbers,
                origin=route.origin,
                destination=route.destination,
                depart=depart,
                cabin=cabin,
                price_cash_brl=price_brl,
                taxes_brl=0.0,
                miles_program=program,
                source=source,
                raw={
                    "via": "firecrawl_interact",
                    "airline_label": airline,
                    "currency": currency,
                    "departure_time": item.get("departure_time"),
                    "duration_min": _parse_duration(item.get("duration_minutes")),
                    "stops": item.get("stops"),
                },
            )
        )
    return offers


#: Rótulos de companhia que o metasearch pode devolver → código IATA.
_AIRLINE_LABELS = {
    "copa": "CM", "avianca": "AV", "latam": "LA", "gol": "G3", "azul": "AD",
    "american": "AA", "united": "UA", "delta": "DL", "tap": "TP", "iberia": "IB",
}


def _carrier_of(label: str, default: str) -> str:
    low = label.lower()
    for name, code in _AIRLINE_LABELS.items():
        if name in low:
            return code
    return default
