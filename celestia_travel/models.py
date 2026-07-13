"""Modelos de domínio tipados da pesquisa de passagens."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional

_IATA_RE = re.compile(r"^[A-Z]{3}$")


class CabinClass(str, Enum):
    ECONOMY = "economica"
    PREMIUM = "premium"
    BUSINESS = "executiva"


@dataclass(frozen=True)
class FlightQuery:
    """Missão de pesquisa definida pelo usuário."""

    origin: str
    destination: str
    depart_date: date
    return_date: Optional[date] = None
    flex_days: int = 0
    cabin: CabinClass = CabinClass.ECONOMY
    passengers: int = 1

    def __post_init__(self) -> None:
        origin = self.origin.upper().strip()
        destination = self.destination.upper().strip()
        object.__setattr__(self, "origin", origin)
        object.__setattr__(self, "destination", destination)

        if not _IATA_RE.match(origin):
            raise ValueError(f"Origem inválida: {self.origin!r} (use código IATA, ex.: GRU)")
        if not _IATA_RE.match(destination):
            raise ValueError(
                f"Destino inválido: {self.destination!r} (use código IATA, ex.: MIA)"
            )
        if origin == destination:
            raise ValueError("Origem e destino não podem ser iguais.")
        if not 0 <= self.flex_days <= 7:
            raise ValueError("flex_days deve estar entre 0 e 7.")
        if not 1 <= self.passengers <= 9:
            raise ValueError("passengers deve estar entre 1 e 9.")
        if self.return_date is not None and self.return_date < self.depart_date:
            raise ValueError("A data de volta não pode ser anterior à ida.")

    @property
    def route(self) -> str:
        return f"{self.origin}-{self.destination}"


@dataclass(frozen=True)
class SearchTask:
    """Uma unidade de busca: provedor × data × rota."""

    provider_name: str
    origin: str
    destination: str
    depart_date: date
    cabin: CabinClass
    passengers: int


@dataclass
class FlightOffer:
    """Oferta de voo normalizada, independente do provedor."""

    provider: str
    airline: str
    flight_number: str
    origin: str
    destination: str
    depart_date: date
    depart_time: str
    duration_minutes: int
    stops: int
    price_cash: float
    taxes: float = 0.0
    currency: str = "BRL"
    miles_price: Optional[int] = None
    miles_program: Optional[str] = None
    deep_link: Optional[str] = None

    @property
    def total_cash(self) -> float:
        return round(self.price_cash + self.taxes, 2)

    def dedup_key(self) -> tuple:
        return (
            self.airline,
            self.flight_number,
            self.depart_date.isoformat(),
            self.depart_time,
        )


@dataclass(frozen=True)
class MilesBalance:
    program: str
    miles: int
    updated_at: datetime


@dataclass
class DealEvaluation:
    """Avaliação de uma oferta pelo comitê de agentes."""

    offer: FlightOffer
    score: float
    cpm: Optional[float] = None
    use_miles: Optional[bool] = None
    miles_sufficient: Optional[bool] = None
    reasons: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


@dataclass
class ResearchReport:
    """Resultado consolidado de uma missão de pesquisa."""

    query: FlightQuery
    generated_at: datetime
    providers_queried: list[str]
    providers_failed: list[str]
    offers_found: int
    offers_valid: int
    evaluations: list[DealEvaluation]
    narrative: str
    narrative_source: str
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "rota": self.query.route,
            "data_ida": self.query.depart_date.isoformat(),
            "data_volta": (
                self.query.return_date.isoformat() if self.query.return_date else None
            ),
            "flexibilidade_dias": self.query.flex_days,
            "passageiros": self.query.passengers,
            "gerado_em": self.generated_at.isoformat(),
            "provedores_consultados": self.providers_queried,
            "provedores_indisponiveis": self.providers_failed,
            "ofertas_encontradas": self.offers_found,
            "ofertas_validas": self.offers_valid,
            "avisos": self.warnings,
            "narrativa": self.narrative,
            "narrativa_fonte": self.narrative_source,
            "top_ofertas": [
                {
                    "posicao": index + 1,
                    "score": round(evaluation.score, 2),
                    "companhia": evaluation.offer.airline,
                    "voo": evaluation.offer.flight_number,
                    "data": evaluation.offer.depart_date.isoformat(),
                    "horario": evaluation.offer.depart_time,
                    "duracao_min": evaluation.offer.duration_minutes,
                    "paradas": evaluation.offer.stops,
                    "preco_total": evaluation.offer.total_cash,
                    "moeda": evaluation.offer.currency,
                    "milhas": evaluation.offer.miles_price,
                    "programa": evaluation.offer.miles_program,
                    "milheiro_implicito": evaluation.cpm,
                    "vale_usar_milhas": evaluation.use_miles,
                    "saldo_suficiente": evaluation.miles_sufficient,
                    "motivos": evaluation.reasons,
                    "alertas": evaluation.flags,
                    "provedor": evaluation.offer.provider,
                }
                for index, evaluation in enumerate(self.evaluations)
            ],
        }
