"""MilesMathAgent — o agente dedicado à matemática de compra.

Responsável por: executiva direto, econômica + upgrade com milhas, emissão em
milhas, econômica + upgrade em dinheiro, valor do milheiro (custo efetivo em
reais ao pagar com milhas) e milheiro de equilíbrio de cada opção.
"""

from __future__ import annotations

from collections import defaultdict

from ..models import Cabin, FlightOffer, PurchaseOption, SearchRequest
from ..pricing import PurchaseCalculator
from .base import Agent


class MilesMathAgent(Agent):
    name = "miles-math"

    def evaluate_offers(
        self, offers: list[FlightOffer], request: SearchRequest
    ) -> list[PurchaseOption]:
        milheiro = self.ctx.settings.milheiro_for(request.program)
        calculator = PurchaseCalculator(milheiro)

        # pair economy/business shelves of the same itinerary
        by_itinerary: dict[str, dict[Cabin, FlightOffer]] = defaultdict(dict)
        for offer in offers:
            by_itinerary[offer.itinerary_key()][offer.cabin] = offer

        options: list[PurchaseOption] = []
        for shelves in by_itinerary.values():
            economy = shelves.get(Cabin.ECONOMY)
            business = shelves.get(Cabin.BUSINESS)
            options.extend(calculator.evaluate(economy, business, request))

        options.sort(key=lambda o: o.effective_total_brl)
        self.log(
            f"{len(options)} opções calculadas (milheiro {request.program} = R$ {milheiro:.2f})"
        )
        return options
