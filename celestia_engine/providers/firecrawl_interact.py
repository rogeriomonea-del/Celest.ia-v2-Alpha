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
from .base import ProviderError, post_json

# empresa/programa/fonte por site
_SITE_META = {
    "copa": ("CM", "connectmiles", Source.COPA),
    "latam": ("LA", "latampass", Source.LATAM),
}

#: rótulo de cabine em pt-BR usado nos prompts (Copa/LATAM/Google Flights).
_CABIN_GF = {Cabin.ECONOMY: "Econômica", Cabin.PREMIUM: "Premium", Cabin.BUSINESS: "Executiva"}


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
    """Estratégia firecrawl_interact: retorna ofertas de TODAS as cabines.

    Delega ao script nomeado do site (``copa_direct``/``latam_direct``) —
    ver ``firecrawl_scripts``. Mantido como API pública estável.
    """
    from . import firecrawl_scripts

    carrier, program, source = _SITE_META[site]
    return await firecrawl_scripts.run_offer_script(
        settings,
        firecrawl_scripts.SITE_SCRIPT[site],
        carrier=carrier,
        program=program,
        source=source,
        route=route,
        depart=depart,
    )


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

    Delega ao script ``google_flights_calendar``. Uma única sessão Interact
    abre o Google Flights, define rota/classe e o intervalo amplo, e extrai o
    preço de cada data — para CORTAR datas caras antes de gastar scraping (o
    FlexDateScoutAgent escolhe as mais baratas).
    """
    from . import firecrawl_scripts

    return await firecrawl_scripts.run_calendar_script(
        settings,
        origin=origin,
        destination=destination,
        cabin=cabin,
        start=start,
        end=end,
    )


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


def _money_to_brl(value, currency: str, usd_brl_rate: float) -> float | None:
    """Converte um valor monetário para BRL (USD→BRL pela taxa). None se inválido."""
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    return round(amount * usd_brl_rate, 2) if currency == "USD" else round(amount, 2)


def _to_positive_int(value) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _cabin_of(value) -> Cabin:
    text = str(value or "").lower()
    if text.startswith(("business", "exec")):
        return Cabin.BUSINESS
    if text.startswith(("premium", "prem")):
        return Cabin.PREMIUM
    return Cabin.ECONOMY


def _flight_numbers(raw_numbers, carrier: str) -> tuple[str, ...]:
    # o LLM pode devolver flight_numbers como string em vez de array; sem
    # normalizar, iterar uma string explode em caracteres soltos.
    if isinstance(raw_numbers, str):
        raw_numbers = [raw_numbers]
    numbers = tuple(str(n) for n in (raw_numbers or []) if str(n).strip())
    return numbers or (f"{carrier} ?",)


def _clean_layovers(value) -> list[dict]:
    """Normaliza a lista de conexões: [{airport, minutes}]."""
    if not isinstance(value, list):
        return []
    out: list[dict] = []
    for layover in value:
        if not isinstance(layover, dict):
            continue
        airport = str(layover.get("airport") or "").strip().upper()
        if airport:
            out.append({"airport": airport, "minutes": _parse_duration(layover.get("minutes"))})
    return out


def _resolve_carrier(airline: str, iata: str, default: str) -> str:
    iata = iata.strip().upper()
    if len(iata) == 2 and iata.isalpha():
        return iata
    if default and airline.upper().startswith(default):
        return default
    return _carrier_of(airline, default)


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
    """Extrai ofertas ricas do JSON devolvido pela extração do Interact.

    Além do preço em dinheiro, captura milhas, impostos, horários (ida/volta),
    duração, escalas (aeroporto + tempo), aeronave, família tarifária, bagagem e
    assentos restantes. Uma oferta vale se tiver preço em dinheiro OU em milhas.
    """
    obj = _find_json(text)
    if not obj:
        return []
    offers: list[FlightOffer] = []
    for item in obj.get("offers") or []:
        if not isinstance(item, dict):
            continue
        currency = str(item.get("currency") or "BRL").upper()
        price_brl = _money_to_brl(item.get("price"), currency, usd_brl_rate)
        price_miles = _to_positive_int(item.get("price_miles"))
        if price_brl is None and price_miles is None:
            continue  # sem dinheiro e sem milhas → não é uma oferta cotável
        airline = str(item.get("airline") or carrier)
        offers.append(
            FlightOffer(
                carrier=_resolve_carrier(airline, str(item.get("airline_iata") or ""), carrier),
                flight_numbers=_flight_numbers(item.get("flight_numbers"), carrier),
                origin=route.origin,
                destination=route.destination,
                depart=depart,
                cabin=_cabin_of(item.get("cabin")),
                price_cash_brl=price_brl,
                taxes_brl=_money_to_brl(item.get("taxes"), currency, usd_brl_rate) or 0.0,
                price_miles=price_miles,
                miles_program=program or None,
                seats_left=_to_positive_int(item.get("seats_left")),
                source=source,
                raw={
                    "via": "firecrawl_interact",
                    "airline_label": airline,
                    "currency": currency,
                    "fare_brand": item.get("fare_brand"),
                    "departure_time": item.get("departure_time"),
                    "arrival_time": item.get("arrival_time"),
                    "arrival_day_offset": item.get("arrival_day_offset"),
                    "duration_min": _parse_duration(item.get("duration_minutes")),
                    "stops": item.get("stops"),
                    "layovers": _clean_layovers(item.get("layovers")),
                    "aircraft": item.get("aircraft"),
                    "baggage": item.get("baggage"),
                    "booking_url": _clean_url(item.get("booking_url")),
                },
            )
        )
    return offers


def _clean_url(value) -> str | None:
    """Só aceita URL http(s) completa — o LLM às vezes devolve texto solto."""
    url = str(value or "").strip()
    return url if url.startswith(("http://", "https://")) else None


def _carrier_of(label: str, default: str) -> str:
    """Rótulo livre → IATA usando o registro central da malha de companhias."""
    from ..airlines import resolve_carrier_label

    return resolve_carrier_label(label, default)
