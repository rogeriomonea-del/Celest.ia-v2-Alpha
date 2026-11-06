"""MilesMathAgent — o agente dedicado à matemática de compra.

Responsável por: executiva direto, econômica + upgrade com milhas, emissão em
milhas, econômica + upgrade em dinheiro, valor do milheiro (custo efetivo em
reais ao pagar com milhas) e milheiro de equilíbrio de cada opção.
"""

from __future__ import annotations

from collections import defaultdict

from ..models import Cabin, FlightOffer, PurchaseOption, SearchRequest, offer_identity
from ..pricing import PurchaseCalculator
from .base import Agent


class MilesMathAgent(Agent):
    name = "miles-math"

    def evaluate_offers(
        self, offers: list[FlightOffer], request: SearchRequest
    ) -> list[PurchaseOption]:
        settings = self.ctx.settings
        calculator = PurchaseCalculator(settings.milheiro_for, request.program)

        # pair economy/business shelves of the same itinerary; offer_identity
        # keeps placeholder numbers ("CM ?") from colliding into one slot
        by_itinerary: dict[str, dict[Cabin, FlightOffer]] = defaultdict(dict)
        for offer in offers:
            by_itinerary[offer_identity(offer)][offer.cabin] = offer

        options: list[PurchaseOption] = []
        for shelves in by_itinerary.values():
            economy = shelves.get(Cabin.ECONOMY)
            # premium conta como shelf superior quando não há executiva —
            # buscas premium não podem terminar com 0 opções de compra
            business = shelves.get(Cabin.BUSINESS) or shelves.get(Cabin.PREMIUM)
            options.extend(calculator.evaluate(economy, business, request))

        options.sort(key=lambda o: o.effective_total_brl)
        self.log(
            f"{len(options)} opções calculadas (milheiro {request.program} = "
            f"R$ {settings.milheiro_for(request.program):.2f}; ofertas de outro "
            "programa usam o milheiro dele)"
        )
        return options
