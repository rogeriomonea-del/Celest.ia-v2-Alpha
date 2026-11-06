"""Typed domain models shared by every agent and provider."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum


class Cabin(str, Enum):
    ECONOMY = "economy"
    PREMIUM = "premium"
    BUSINESS = "business"


class Source(str, Enum):
    GOOGLE_FLIGHTS = "google_flights"
    GOOGLE_FLIGHTS2 = "google_flights2"
    SKYSCANNER = "skyscanner"
    COPA = "copa"
    LATAM = "latam"
    GOL = "gol"
    AZUL = "azul"
    MOCK = "mock"


class Strategy(str, Enum):
    """The purchase strategies compared by the MilesMathAgent."""

    BUSINESS_CASH = "business_cash"
    ECONOMY_MILES_UPGRADE = "economy_miles_upgrade"
    FULL_MILES = "full_miles"
    ECONOMY_CASH_UPGRADE = "economy_cash_upgrade"
    #: linha de base: a passagem anunciada, em dinheiro — garante que TODA
    #: oferta com preço gere ao menos uma opção de compra
    ECONOMY_CASH = "economy_cash"


STRATEGY_LABELS: dict[Strategy, str] = {
    Strategy.BUSINESS_CASH: "Executiva direto (dinheiro)",
    Strategy.ECONOMY_MILES_UPGRADE: "Econômica + upgrade com milhas",
    Strategy.FULL_MILES: "Emissão em milhas (award)",
    Strategy.ECONOMY_CASH_UPGRADE: "Econômica + upgrade em dinheiro",
    Strategy.ECONOMY_CASH: "Passagem direto (dinheiro)",
}


@dataclass(frozen=True)
class Route:
    """A flyable city pair on a given carrier's network."""

    origin: str
    destination: str
    carrier: str  # IATA airline code: CM, LA... or "*" for metasearch routes
    direct: bool = True
    via: str | None = None  # connection point when direct is False

    def key(self) -> str:
        return f"{self.origin}-{self.destination}"

    def slug(self) -> str:
        """Unique identity of this option (carrier + path), for dict keys."""
        return f"{self.carrier}:{self.origin}-{self.via or ''}-{self.destination}"

    def __str__(self) -> str:  # pragma: no cover - display helper
        path = f"{self.origin}→{self.via}→{self.destination}" if self.via else f"{self.origin}→{self.destination}"
        return f"{path} ({self.carrier})"


@dataclass
class FareQuote:
    """Indicative price from a cheap pre-filter source (not bookable)."""

    route: Route
    depart: date
    cabin: Cabin
    price_brl: float
    source: Source
    fetched_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class FlightOffer:
    """A bookable itinerary scraped from an airline source.

    ``price_cash_brl`` is the all-in cash fare. ``price_miles`` is the award
    price in miles with ``taxes_brl`` due in cash. Upgrade fields describe the
    cost of moving this economy itinerary up to business.
    """

    carrier: str
    flight_numbers: tuple[str, ...]
    origin: str
    destination: str
    depart: date
    cabin: Cabin
    price_cash_brl: float | None = None
    taxes_brl: float = 0.0
    price_miles: int | None = None
    miles_program: str | None = None
    upgrade_miles: int | None = None
    upgrade_cash_brl: float | None = None
    seats_left: int | None = None
    source: Source = Source.MOCK
    raw: dict = field(default_factory=dict)

    def itinerary_key(self) -> str:
        return f"{self.carrier}:{'/'.join(self.flight_numbers)}:{self.origin}-{self.destination}:{self.depart.isoformat()}"


def has_placeholder_numbers(offer: FlightOffer) -> bool:
    """Sem número de voo real ("CM ?" ou o fallback "GRU-MCO" do metasearch)."""
    numbers = "/".join(offer.flight_numbers)
    return not numbers or "?" in numbers or numbers == f"{offer.origin}-{offer.destination}"


def offer_identity(offer: FlightOffer) -> str:
    """Chave única do itinerário (sem cabine), usada pela auditoria, pelo
    pareamento de cabines do MilesMathAgent e pelo id da API. Com número de
    voo placeholder, voos distintos colidiriam: anexa um hash curto e estável
    de horário + preços."""
    key = offer.itinerary_key()
    if not has_placeholder_numbers(offer):
        return key
    raw = offer.raw or {}
    basis = (
        f"{raw.get('departure_time') or ''}:{offer.price_cash_brl or ''}"
        f":{offer.price_miles or ''}"
    )
    return f"{key}#{hashlib.sha256(basis.encode()).hexdigest()[:8]}"


@dataclass
class PurchaseOption:
    """One evaluated way of buying the trip, ready for ranking."""

    strategy: Strategy
    label: str
    cabin_final: Cabin
    cash_brl: float
    miles: int
    milheiro_brl: float | None
    effective_total_brl: float
    breakeven_milheiro_brl: float | None
    offer_key: str
    notes: list[str] = field(default_factory=list)
    #: programa cujo milheiro foi aplicado (None quando não há milhas)
    miles_program: str | None = None


#: Presets de flexibilidade → raio em dias ao redor da data escolhida.
FLEX_PRESETS: dict[str, int] = {"1w": 7, "2w": 14, "3w": 21, "1m": 30}


@dataclass
class Flexibility:
    """Janela de datas flexíveis (para o flex-date scout do calendário)."""

    enabled: bool = False
    preset: str = ""  # "1w" | "2w" | "3w" | "1m" | "custom"
    window_start: date | None = None
    window_end: date | None = None

    def resolve_window(self, depart: date) -> tuple[date, date]:
        """Intervalo [início, fim] a varrer no calendário de preços."""
        if self.preset == "custom" and self.window_start and self.window_end:
            start, end = self.window_start, self.window_end
            return (start, end) if start <= end else (end, start)
        radius = FLEX_PRESETS.get(self.preset, 7)
        return depart - timedelta(days=radius), depart + timedelta(days=radius)


@dataclass
class DatePrice:
    """Preço indicativo de uma data, lido do calendário do Google Flights."""

    date: date
    price_brl: float
    source: Source


@dataclass
class SearchRequest:
    origin: str
    destination: str
    depart: date
    return_date: date | None = None
    cabin_target: Cabin = Cabin.BUSINESS
    passengers: int = 1
    flex_days: int = 0  # also search +/- N days around depart
    flexibility: Flexibility | None = None  # janela ampla + scout de calendário
    flex_max_dates: int = 5  # quantas datas mais baratas manter para scraping
    miles_balance: int = 0
    program: str = "connectmiles"


@dataclass
class SearchStats:
    candidates_total: int = 0
    candidates_scraped: int = 0
    scrapes_saved_by_prefilter: int = 0
    subagents_spawned: int = 0
    duration_seconds: float = 0.0


@dataclass
class SearchReport:
    request: SearchRequest
    quotes: list[FareQuote]
    offers: list[FlightOffer]
    options: list[PurchaseOption]
    stats: SearchStats
    agent_log: list[str]

    def best_option(self) -> PurchaseOption | None:
        return self.options[0] if self.options else None
