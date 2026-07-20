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


def _flight_json(offer: FlightOffer) -> dict:
    raw = offer.raw or {}
    return {
        "id": offer.itinerary_key() + f":{offer.cabin.value}",
        "carrier": offer.carrier,
        "airlineLabel": str(raw.get("airline_label") or ""),
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


def _report_json(report: SearchReport, settings: Settings) -> dict:
    stats = report.stats
    return {
        "mode": "mock" if settings.mock_mode else "real",
        "flights": [_flight_json(offer) for offer in report.offers],
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
        request = _to_request(body)
        orchestrator = Orchestrator(app.state.settings)
        try:
            report = await orchestrator.search(request)
        except Exception as error:  # noqa: BLE001 - erro do motor vira 502 legível
            raise HTTPException(502, f"busca falhou: {error}") from error
        return _report_json(report, app.state.settings)

    return app


app = create_app()
