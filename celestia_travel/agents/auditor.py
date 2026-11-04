"""Agente 3 — Auditor: valida, deduplica e sinaliza ofertas suspeitas."""
from __future__ import annotations

import statistics

from celestia_travel.agents.base import LEVEL_INFO, LEVEL_OK, Agent, AgentContext
from celestia_travel.models import FlightOffer


class AuditorAgent(Agent):
    name = "auditor"

    # Oferta abaixo de 35% da mediana é sinalizada como possível erro de tarifa;
    # acima de 4x a mediana é descartada como outlier.
    SUSPICIOUS_LOW_RATIO = 0.35
    OUTLIER_HIGH_RATIO = 4.0

    def __init__(self) -> None:
        self.flagged: dict[tuple, list[str]] = {}

    async def run(self, ctx: AgentContext) -> None:
        raw = ctx.offers
        ctx.emit(self.name, LEVEL_INFO, f"Auditando {len(raw)} ofertas...")

        valid: list[FlightOffer] = []
        dropped_invalid = 0
        for offer in raw:
            if offer.price_cash <= 0 or offer.duration_minutes < 0 or offer.stops < 0:
                dropped_invalid += 1
                continue
            if offer.miles_price is not None and offer.miles_price <= 0:
                offer.miles_price = None
                offer.miles_program = None
            valid.append(offer)

        deduped: dict[tuple, FlightOffer] = {}
        for offer in valid:
            key = offer.dedup_key()
            current = deduped.get(key)
            if current is None or offer.total_cash < current.total_cash:
                deduped[key] = offer
        duplicates = len(valid) - len(deduped)

        offers = list(deduped.values())
        dropped_outliers = 0
        self.flagged = {}
        if len(offers) >= 4:
            median = statistics.median(offer.total_cash for offer in offers)
            kept: list[FlightOffer] = []
            for offer in offers:
                if offer.total_cash > median * self.OUTLIER_HIGH_RATIO:
                    dropped_outliers += 1
                    continue
                if offer.total_cash < median * self.SUSPICIOUS_LOW_RATIO:
                    self.flagged.setdefault(offer.dedup_key(), []).append(
                        "Tarifa muito abaixo da mediana — confirme antes de emitir "
                        "(possível erro de tarifa)."
                    )
                kept.append(offer)
            offers = kept

        ctx.offers = offers

        summary = (
            f"{len(offers)} ofertas aprovadas · {duplicates} duplicata(s) consolidada(s)"
        )
        if dropped_invalid:
            summary += f" · {dropped_invalid} inválida(s) removida(s)"
        if dropped_outliers:
            summary += f" · {dropped_outliers} outlier(s) de preço descartado(s)"
        if self.flagged:
            summary += f" · {len(self.flagged)} tarifa(s) suspeita(s) sinalizada(s)"
        ctx.emit(self.name, LEVEL_OK, summary)
