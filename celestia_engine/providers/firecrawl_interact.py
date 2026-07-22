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
    "gol": ("G3", "smiles", Source.GOL),
    "azul": ("AD", "azul", Source.AZUL),
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
        # sessão viva preenchendo formulário real: 60s estourava (ReadTimeout)
        timeout_s=max(settings.http_timeout_s, 150),
        retries=1,
    )
    data = payload.get("data")
    if isinstance(data, str):
        return data
    if not isinstance(data, dict):
        data = payload
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
        salvaged = _salvage_items(text, "calendar")
        if not salvaged:
            return []
        obj = {"calendar": salvaged}
    out: list[DatePrice] = []
    for item in obj.get("calendar") or []:
        if not isinstance(item, dict):
            continue
        parsed = _parse_cal_date(str(item.get("date") or ""))
        if parsed is None:
            continue
        currency = str(item.get("currency") or "BRL").upper()
        price_brl = _money_to_brl(item.get("price"), currency, usd_brl_rate)
        if price_brl is None:
            continue
        out.append(DatePrice(date=parsed, price_brl=price_brl, source=Source.GOOGLE_FLIGHTS))
    return out


def _balanced_objects(text: str, limit: int = 40):
    """Gera cada trecho ``{...}`` balanceado do texto (inclusive aninhados)."""
    start = text.find("{")
    found = 0
    while start != -1 and found < limit:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    yield text[start : i + 1]
                    found += 1
                    break
        start = text.find("{", start + 1)


def _find_json(text: str, key: str = "offers") -> dict | None:
    """Extrai o primeiro objeto JSON que contém `key` (tolera cercas ```)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidates = []
    if fenced:
        candidates.append(fenced.group(1))
    candidates.extend(_balanced_objects(text, limit=7))
    for candidate in candidates:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict) and key in obj:
                return obj
        except (ValueError, TypeError):
            continue
    return None


def _salvage_items(text: str, kind: str) -> list[dict]:
    """JSON cortado no meio (limite de tokens): o objeto externo nunca fecha,
    mas os itens COMPLETOS internos são recuperáveis — sem isto a estratégia
    seria punida como falha mesmo tendo entregado dados."""
    items: list[dict] = []
    for candidate in _balanced_objects(text):
        try:
            obj = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if not isinstance(obj, dict) or kind in obj:
            continue
        if kind == "offers":
            if "price" in obj or "price_miles" in obj or "airline" in obj:
                items.append(obj)
        elif "date" in obj and "price" in obj:
            items.append(obj)
    return items


def _parse_duration(value) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    if isinstance(value, str):
        match = re.search(r"(\d+)\s*h(?:\s*(\d+))?", value)
        if match:
            return int(match.group(1)) * 60 + int(match.group(2) or 0)
        # "680" ou "95 min" (sem componente de horas)
        match = re.search(r"(\d+)\s*(?:min|m\b)", value)
        if match:
            return int(match.group(1))
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return 0


def money_number(value) -> float | None:
    """Número de um valor monetário em QUALQUER formato que o LLM devolva:
    1226, "1226.5", "R$ 1.226,00", "US$1,226.00", "1.226" (milhar BR).
    None quando não é um valor."""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    text = value.strip().replace("\xa0", " ")
    text = re.sub(r"(?i)(r\$|us\$|\$|brl|usd|reais|milhas)", "", text).strip()
    text = text.replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        # o separador que aparece POR ÚLTIMO é o decimal
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")     # 1.226,00
        else:
            text = text.replace(",", "")                        # 1,226.00
    elif "," in text:
        head, _, tail = text.rpartition(",")
        # vírgula com 3 dígitos é milhar ("1,226"); com 1-2, decimal ("1226,5")
        text = head.replace(",", "") + tail if len(tail) == 3 and head else f"{head}.{tail}"
    elif "." in text:
        head, _, tail = text.rpartition(".")
        # ponto com 3 dígitos é milhar BR ("1.226"); senão decimal ("1226.50")
        if len(tail) == 3 and head:
            text = head.replace(".", "") + tail
    try:
        return float(text)
    except ValueError:
        return None


def _money_to_brl(value, currency: str, usd_brl_rate: float) -> float | None:
    """Converte um valor monetário para BRL (USD→BRL pela taxa). None se inválido."""
    amount = money_number(value)
    if amount is None or amount <= 0:
        return None
    if currency != "USD" and isinstance(value, str) and re.search(r"(?i)us\$|usd", value):
        currency = "USD"  # a moeda declarada no próprio valor vence
    return round(amount * usd_brl_rate, 2) if currency == "USD" else round(amount, 2)


def _to_positive_int(value) -> int | None:
    if isinstance(value, str):
        digits = re.sub(r"[^0-9]", "", value)   # "60.000"/"60,000" → 60000
        if not digits:
            return None
        value = digits
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _cabin_of(value) -> Cabin:
    text = str(value or "").lower()
    if "business" in text or "exec" in text or "first" in text or "primeira" in text:
        return Cabin.BUSINESS
    if "premium" in text or "prem" in text:
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
    # códigos IATA são alfanuméricos com ao menos uma letra (G3, 2Z, U2…)
    if len(iata) == 2 and iata.isalnum() and not iata.isdigit():
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
        salvaged = _salvage_items(text, "offers")
        if not salvaged:
            return []
        obj = {"offers": salvaged}
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
                miles_program=(program or None) if price_miles else None,
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
    """Só aceita URL http(s) completa — o LLM às vezes devolve texto solto,
    o placeholder "https://..." do schema, ou a URL com prosa colada."""
    text = str(value or "").strip()
    match = re.search(r"https?://[^\s\"'<>\)\]]+", text)
    if not match:
        return None
    url = match.group(0).rstrip(".,;")
    host = url.split("//", 1)[-1].split("/", 1)[0]
    # host real tem um ponto entre caracteres alfanuméricos ("https://..." não)
    if not re.search(r"[a-z0-9]\.[a-z0-9]", host, re.IGNORECASE):
        return None
    return url


def _carrier_of(label: str, default: str) -> str:
    """Rótulo livre → IATA usando o registro central da malha de companhias."""
    from ..airlines import resolve_carrier_label

    return resolve_carrier_label(label, default)
