"""API HTTP do celest.ia — a ponte entre o site e o motor multi-agente.

Expõe o ``Orchestrator`` (busca real: pré-filtro, scraping, milhas) como uma
API web que o front-end (``celestia_dashboard``) consome:

    POST /api/search    — busca completa; devolve voos + estratégias de compra
    GET  /api/scripts   — playbooks do Firecrawl Interact registrados
    GET  /api/status    — integrações ativas nesta instalação
    GET  /api/health    — liveness (para monitoração/load balancer)

Como rodar (na raiz do projeto, com o ``.env`` preenchido):

    python -m celestia_engine serve            # http://127.0.0.1:8000
    CELESTIA_MOCK=1 python -m celestia_engine serve   # demo offline

O front em dev (``npm run dev``) já tem proxy de ``/api`` para a porta 8000.
"""

from __future__ import annotations

import hashlib
from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .agents.orchestrator import Orchestrator
from .airlines import airline_name, booking_url_for, google_flights_url
from .storage import load_discovered
from .config import Settings, load_settings
from .models import (
    Cabin,
    FlightOffer,
    Flexibility,
    PurchaseOption,
    SearchReport,
    SearchRequest,
)

_PRESETS = {"1w", "2w", "3w", "1m", "custom"}


# ------------------------------------------------------------- request models
class FlexibilityIn(BaseModel):
    enabled: bool = False
    preset: str = "2w"
    window_start: str | None = Field(default=None, alias="windowStart")
    window_end: str | None = Field(default=None, alias="windowEnd")

    model_config = {"populate_by_name": True}

    @field_validator("preset")
    @classmethod
    def _preset_known(cls, value: str) -> str:
        if value not in _PRESETS:
            raise ValueError(f"preset deve ser um de {sorted(_PRESETS)}")
        return value


class SearchIn(BaseModel):
    origin: str
    destination: str
    depart: str  # YYYY-MM-DD
    return_date: str | None = Field(default=None, alias="returnDate")
    cabin: str = "economy"
    passengers: int = 1
    flex_days: int = Field(default=0, alias="flexDays", ge=0, le=3)
    flexibility: FlexibilityIn | None = None
    flex_max_dates: int = Field(default=5, alias="flexMaxDates", ge=1, le=15)
    miles_balance: int = Field(default=0, alias="milesBalance", ge=0)
    program: str = "connectmiles"

    model_config = {"populate_by_name": True}

    @field_validator("origin", "destination")
    @classmethod
    def _iata(cls, value: str) -> str:
        code = value.strip().upper()
        if len(code) != 3 or not code.isalpha():
            raise ValueError("informe um código IATA de 3 letras (ex.: GRU)")
        return code

    @field_validator("cabin")
    @classmethod
    def _cabin_known(cls, value: str) -> str:
        if value not in {c.value for c in Cabin}:
            raise ValueError("cabin deve ser economy, premium ou business")
        return value


def _parse_iso(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(422, f"{field} inválida ({value!r}): use YYYY-MM-DD") from error


def _to_request(body: SearchIn) -> SearchRequest:
    flexibility = None
    if body.flexibility and body.flexibility.enabled:
        flex = body.flexibility
        flexibility = Flexibility(
            enabled=True,
            preset=flex.preset,
            window_start=_parse_iso(flex.window_start, "windowStart") if flex.window_start else None,
            window_end=_parse_iso(flex.window_end, "windowEnd") if flex.window_end else None,
        )
    return SearchRequest(
        origin=body.origin,
        destination=body.destination,
        depart=_parse_iso(body.depart, "depart"),
        return_date=_parse_iso(body.return_date, "returnDate") if body.return_date else None,
        cabin_target=Cabin(body.cabin),
        passengers=max(1, body.passengers),
        flex_days=body.flex_days,
        flexibility=flexibility,
        flex_max_dates=body.flex_max_dates,
        miles_balance=body.miles_balance,
        program=body.program.lower().strip() or "connectmiles",
    )


# --------------------------------------------------------------- serialization
def _schedule_of(offer: FlightOffer) -> dict:
    """Horários reais quando o scraper os capturou; senão, estimativa
    determinística (marcada como ``estimated``) só para a UI ter o que exibir."""
    raw = offer.raw or {}
    departure = str(raw.get("departure_time") or "").strip()
    duration = int(raw.get("duration_min") or 0)
    estimated = False

    seed = int(hashlib.sha256(offer.itinerary_key().encode()).hexdigest()[:6], 16)
    if not departure or ":" not in departure:
        departure = f"{5 + seed % 17:02d}:{(seed % 4) * 15:02d}"
        estimated = True
    if duration <= 0:
        duration = 150 + seed % 480  # 2h30–10h30
        if raw.get("route_via"):
            duration += 95  # conexão planejada soma a parada
        estimated = True

    try:
        dep_h, dep_m = (int(part) for part in departure.split(":")[:2])
    except ValueError:
        dep_h, dep_m = 8, 0
        estimated = True
    total = dep_h * 60 + dep_m + duration
    arrival = str(raw.get("arrival_time") or "").strip()
    day_offset = raw.get("arrival_day_offset")
    if not arrival or ":" not in arrival:
        arrival = f"{(total // 60) % 24:02d}:{total % 60:02d}"
        day_offset = total // (24 * 60)
    return {
        "departureTime": f"{dep_h:02d}:{dep_m:02d}",
        "arrivalTime": arrival,
        "arrivalDayOffset": int(day_offset or 0),
        "durationMin": duration,
        "scheduleEstimated": estimated,
    }


def _stops_of(offer: FlightOffer) -> list[dict]:
    raw = offer.raw or {}
    layovers = raw.get("layovers")
    if isinstance(layovers, list) and layovers:
        return [
            {"airport": str(l.get("airport") or "???"), "layoverMin": int(l.get("minutes") or 90)}
            for l in layovers
            if isinstance(l, dict)
        ]
    via = str(raw.get("route_via") or "").strip()
    if via:
        return [{"airport": via, "layoverMin": 95}]
    return []


def _booking_url(offer: FlightOffer, settings: Settings) -> str:
    """Link do botão "Ver oferta": o capturado pelo scraper, senão o deep-link
    da companhia (registro da malha), senão a busca no Google Flights."""
    raw_url = str((offer.raw or {}).get("booking_url") or "").strip()
    if raw_url.startswith(("http://", "https://")):
        return raw_url
    return booking_url_for(
        settings,
        carrier=offer.carrier,
        origin=offer.origin,
        destination=offer.destination,
        depart=offer.depart,
        cabin=offer.cabin.value,
    )


def _miles_equivalent(price_brl: float | None, milheiro: float) -> int | None:
    """Quantas milhas (ao milheiro do programa do usuário) equivalem ao preço
    em dinheiro — o módulo de milhas visível em TODO resultado."""
    if price_brl is None or price_brl <= 0 or milheiro <= 0:
        return None
    return int(round(price_brl / milheiro * 1000))


def _airline_label(offer: FlightOffer, settings: Settings) -> str:
    """Nome da companhia para o card: rótulo do metasearch, senão o registro
    curado, senão o que o aprendizado gravou em airlines_discovered.csv —
    fecha o ciclo: companhias descobertas em buscas passadas ganham nome."""
    label = str((offer.raw or {}).get("airline_label") or "").strip()
    if label:
        return label
    curated = airline_name(offer.carrier, fallback="\x00")
    if curated != "\x00":
        return curated
    discovered = load_discovered(settings).get(offer.carrier)
    if discovered:
        return str(discovered.get("label") or "").strip()
    return ""


def _flight_json(offer: FlightOffer, settings: Settings, milheiro: float) -> dict:
    raw = offer.raw or {}
    return {
        "id": offer.itinerary_key() + f":{offer.cabin.value}",
        "carrier": offer.carrier,
        "airlineLabel": _airline_label(offer, settings),
        "flightNumbers": list(offer.flight_numbers),
        "origin": offer.origin,
        "destination": offer.destination,
        "depart": offer.depart.isoformat(),
        "cabin": offer.cabin.value,
        "priceBrl": offer.price_cash_brl,
        "taxesBrl": offer.taxes_brl,
        "priceMiles": offer.price_miles,
        "milesProgram": offer.miles_program,
        "seatsLeft": offer.seats_left,
        "source": offer.source.value,
        "strategy": raw.get("strategy"),
        "fareBrand": raw.get("fare_brand"),
        "aircraft": raw.get("aircraft"),
        "stops": _stops_of(offer),
        **_schedule_of(offer),
        "indicative": bool(raw.get("indicative")),
        "bookingUrl": _booking_url(offer, settings),
        "milesEquivalent": _miles_equivalent(offer.price_cash_brl, milheiro),
    }


def _option_json(option: PurchaseOption) -> dict:
    return {
        "strategy": option.strategy.value,
        "label": option.label,
        "cabinFinal": option.cabin_final.value,
        "cashBrl": option.cash_brl,
        "miles": option.miles,
        "milheiroBrl": option.milheiro_brl,
        "effectiveTotalBrl": option.effective_total_brl,
        "breakevenMilheiroBrl": option.breakeven_milheiro_brl,
        "offerKey": option.offer_key,
        "notes": option.notes,
    }


def _indicative_flight_json(quote, settings: Settings, milheiro: float) -> dict:
    """Cotação do pré-filtro (metasearch) apresentada como card indicativo.

    Usada quando o scraping não devolveu ofertas (rota fora da malha Copa/LATAM,
    anti-bot, etc.): o usuário ainda vê os preços reais do Google Flights/
    Skyscanner em vez de uma página vazia. Sem número de voo — é uma tarifa
    de referência, não um itinerário reservável.
    """
    route = quote.route
    seed = int(
        hashlib.sha256(f"{route.slug()}:{quote.depart.isoformat()}".encode()).hexdigest()[:6], 16
    )
    departure = f"{5 + seed % 17:02d}:{(seed % 4) * 15:02d}"
    duration = 150 + seed % 480 + (95 if route.via else 0)
    dep_h, dep_m = int(departure[:2]), int(departure[3:])
    total = dep_h * 60 + dep_m + duration
    return {
        "id": f"quote:{route.slug()}:{quote.depart.isoformat()}:{quote.cabin.value}",
        "carrier": route.carrier,
        # rota de companhia conhecida mostra o nome dela; par metasearch ("*")
        # mostra a fonte da cotação
        "airlineLabel": (
            airline_name(route.carrier) if route.carrier != "*" else quote.source.value
        ),
        "flightNumbers": [],
        "origin": route.origin,
        "destination": route.destination,
        "depart": quote.depart.isoformat(),
        "cabin": quote.cabin.value,
        "priceBrl": quote.price_brl,
        "taxesBrl": 0.0,
        "priceMiles": None,
        "milesProgram": None,
        "seatsLeft": None,
        "source": quote.source.value,
        "strategy": None,
        "fareBrand": None,
        "aircraft": None,
        "stops": [{"airport": route.via, "layoverMin": 95}] if route.via else [],
        "departureTime": departure,
        "arrivalTime": f"{(total // 60) % 24:02d}:{total % 60:02d}",
        "arrivalDayOffset": total // (24 * 60),
        "durationMin": duration,
        "scheduleEstimated": True,
        "indicative": True,
        "milesEquivalent": _miles_equivalent(quote.price_brl, milheiro),
        "bookingUrl": booking_url_for(
            settings,
            carrier=route.carrier,
            origin=route.origin,
            destination=route.destination,
            depart=quote.depart,
            cabin=quote.cabin.value,
        ),
    }


def _report_json(report: SearchReport, settings: Settings) -> dict:
    """Escada de resultados — o usuário NUNCA sai de mãos vazias:

    1. ofertas raspadas (reserváveis, dados ricos);
    2. senão, cotações do pré-filtro como tarifas indicativas;
    3. senão (nenhuma fonte respondeu com preço), ``lastResort``: o link da
       busca já montada no Google Flights para o mesmo par/data. O sistema
       não julga se um voo "vale a pena" — sempre entrega o mais barato que
       alguma fonte devolveu, e no pior caso entrega o caminho para ver.
    """
    stats = report.stats
    request = report.request
    milheiro = settings.milheiro_for(request.program)
    flights = [_flight_json(offer, settings, milheiro) for offer in report.offers]
    if not flights and report.quotes:
        # scraping vazio mas o pré-filtro cotou: mostra as tarifas indicativas
        flights = [
            _indicative_flight_json(quote, settings, milheiro)
            for quote in report.quotes[:12]
        ]
    last_resort = None
    if not flights:
        last_resort = {
            "bookingUrl": google_flights_url(
                request.origin, request.destination, request.depart
            ),
            "reason": "nenhuma fonte respondeu com preço para esta busca",
        }
    return {
        "mode": "mock" if settings.mock_mode else "real",
        "flights": flights,
        "lastResort": last_resort,
        "options": [_option_json(option) for option in report.options],
        "quotes": [
            {
                "route": quote.route.slug(),
                "depart": quote.depart.isoformat(),
                "priceBrl": quote.price_brl,
                "source": quote.source.value,
            }
            for quote in report.quotes[:20]
        ],
        "stats": {
            "candidatesTotal": stats.candidates_total,
            "candidatesScraped": stats.candidates_scraped,
            "scrapesSavedByPrefilter": stats.scrapes_saved_by_prefilter,
            "subagentsSpawned": stats.subagents_spawned,
            "durationSeconds": stats.duration_seconds,
        },
        "agentLog": report.agent_log,
    }


# ------------------------------------------------------------------------ app
def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="celest.ia API", version="1.0")
    app.state.settings = settings or load_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # API pública de leitura; restrinja por domínio em produção
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/api/status")
    async def status() -> dict:
        s: Settings = app.state.settings
        return {
            "mockMode": s.mock_mode,
            "firecrawl": s.has_firecrawl(),
            "firecrawlInteract": s.has_firecrawl() and s.firecrawl_interact_enabled,
            "googleFlightsSerpapi": s.has_google_flights(),
            "googleFlights2": s.has_google_flights2(),
            "skyscanner": s.has_skyscanner(),
            "lyovMesh": s.has_lyov(),
            "strategies": [x.strip() for x in s.scrape_strategies.split(",") if x.strip()],
            "prefilterTopK": s.prefilter_top_k,
        }

    @app.get("/api/scripts")
    async def scripts() -> dict:
        from .providers.firecrawl_scripts import SCRIPTS

        s: Settings = app.state.settings
        return {
            "scripts": [
                {
                    "name": script.name,
                    "kind": script.kind,
                    "description": script.description,
                    "targetUrl": script.url(s),
                }
                for script in SCRIPTS.values()
            ]
        }

    @app.post("/api/search")
    async def search(body: SearchIn) -> dict:
        import asyncio

        s: Settings = app.state.settings
        request = _to_request(body)
        orchestrator = Orchestrator(s)
        try:
            report = await asyncio.wait_for(
                orchestrator.search(request), timeout=s.api_search_timeout_s
            )
        except asyncio.TimeoutError as error:
            raise HTTPException(
                504,
                f"busca excedeu {s.api_search_timeout_s:.0f}s — scraping real pode "
                "demorar; aumente API_SEARCH_TIMEOUT_S no .env ou tente de novo",
            ) from error
        except Exception as error:  # noqa: BLE001 - erro do motor vira 502 legível
            raise HTTPException(502, f"busca falhou: {error}") from error
        return _report_json(report, s)

    return app


app = create_app()
