"""Agente 4 — Avaliador: pontua ofertas e decide dinheiro vs. milhas."""
from __future__ import annotations

from celestia_travel.agents.base import LEVEL_INFO, LEVEL_OK, Agent, AgentContext
from celestia_travel.models import DealEvaluation, FlightOffer


def implied_cpm(offer: FlightOffer) -> float | None:
    """Milheiro implícito da emissão: R$ economizados por 1.000 milhas.

    ``(preço em dinheiro - taxas da emissão) / milhas * 1000``. Quanto maior,
    mais valiosa é a emissão com milhas frente a pagar em dinheiro.
    """
    if not offer.miles_price:
        return None
    saved = offer.price_cash  # taxas são pagas também na emissão com milhas
    return round(saved / offer.miles_price * 1000, 2)


class MilesValuationAgent(Agent):
    name = "avaliador"

    def __init__(self, auditor_flags: dict[tuple, list[str]] | None = None) -> None:
        self._auditor_flags = auditor_flags if auditor_flags is not None else {}

    async def run(self, ctx: AgentContext) -> None:
        offers = ctx.offers
        if not offers:
            ctx.warn(self.name, "Nenhuma oferta para avaliar.")
            ctx.evaluations = []
            return

        ctx.emit(
            self.name,
            LEVEL_INFO,
            f"Avaliando {len(offers)} ofertas (milheiro de referência: "
            f"R$ {ctx.settings.milheiro_reference:.2f}/1.000)...",
        )

        prices = [offer.total_cash for offer in offers]
        min_price, max_price = min(prices), max(prices)
        price_span = max(max_price - min_price, 1e-9)
        max_duration = max(
            (offer.duration_minutes for offer in offers if offer.duration_minutes > 0),
            default=0,
        )

        balance_by_program = {
            balance.program.split(" (")[0]: balance.miles for balance in ctx.balances
        }

        evaluations: list[DealEvaluation] = []
        miles_worth_count = 0

        for offer in offers:
            reasons: list[str] = []
            flags = list(self._auditor_flags.get(offer.dedup_key(), []))

            price_norm = (offer.total_cash - min_price) / price_span  # 0 = mais barata
            score = 10.0 - 6.0 * price_norm
            score -= 0.9 * offer.stops
            if max_duration > 0 and offer.duration_minutes > 0:
                score -= 1.2 * (offer.duration_minutes / max_duration)
            if flags:
                score -= 1.5

            if price_norm < 0.05:
                reasons.append("Entre as tarifas mais baratas da janela pesquisada.")
            if offer.stops == 0:
                reasons.append("Voo direto.")
            elif offer.stops >= 2:
                reasons.append(f"{offer.stops} paradas — considere o desgaste da conexão.")

            cpm = implied_cpm(offer)
            use_miles = None
            miles_sufficient = None
            if cpm is not None:
                use_miles = cpm >= ctx.settings.milheiro_reference
                if use_miles:
                    miles_worth_count += 1
                    reasons.append(
                        f"Emissão com milhas vale a pena: milheiro implícito de "
                        f"R$ {cpm:.2f} ≥ referência de R$ {ctx.settings.milheiro_reference:.2f}."
                    )
                else:
                    reasons.append(
                        f"Pague em dinheiro: milheiro implícito de R$ {cpm:.2f} "
                        f"abaixo da sua referência de R$ {ctx.settings.milheiro_reference:.2f}."
                    )
                    score -= 0.2

                if offer.miles_program:
                    program_key = offer.miles_program.split(" (")[0]
                    balance = balance_by_program.get(program_key)
                    if balance is not None and offer.miles_price:
                        needed = offer.miles_price * ctx.query.passengers
                        miles_sufficient = balance >= needed
                        if use_miles and not miles_sufficient:
                            flags.append(
                                f"Saldo {offer.miles_program} insuficiente: "
                                f"{balance:,} < {needed:,} milhas necessárias.".replace(",", ".")
                            )

            evaluations.append(
                DealEvaluation(
                    offer=offer,
                    score=round(max(score, 0.0), 2),
                    cpm=cpm,
                    use_miles=use_miles,
                    miles_sufficient=miles_sufficient,
                    reasons=reasons,
                    flags=flags,
                )
            )

        evaluations.sort(key=lambda evaluation: evaluation.score, reverse=True)
        ctx.evaluations = evaluations

        ctx.emit(
            self.name,
            LEVEL_OK,
            f"{len(evaluations)} ofertas pontuadas · "
            f"{miles_worth_count} emissão(ões) com milhas vantajosa(s).",
        )
