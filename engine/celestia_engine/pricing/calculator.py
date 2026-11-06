"""Cálculo de compra: as quatro estratégias + matemática do milheiro.

Conceitos:

* **Milheiro** — preço de mercado de 1000 milhas em reais (o que você paga
  para adquirir/transferir milhas). Configurável por programa.
* **Custo efetivo** — dinheiro desembolsado + (milhas gastas / 1000) × milheiro.
  É a régua única que permite comparar estratégias mistas.
* **Milheiro de equilíbrio (breakeven)** — o valor de milheiro que tornaria a
  estratégia com milhas idêntica, em custo efetivo, à melhor opção 100% em
  dinheiro. Se você consegue comprar milhas abaixo do breakeven, a estratégia
  com milhas vence.

O milheiro é resolvido POR OFERTA: uma emissão LATAM usa o milheiro do LATAM
Pass mesmo que a busca tenha sido feita com ConnectMiles.
"""

from __future__ import annotations

from typing import Callable

from ..models import (
    Cabin,
    FlightOffer,
    PurchaseOption,
    SearchRequest,
    Strategy,
    STRATEGY_LABELS,
    offer_identity,
)


def _brl(value: float) -> str:
    """1234.5 → "1.234,50" (pt-BR). O replace ingênuo gerava "1.234.50"."""
    grouped = f"{value:,.2f}"  # 1,234.50
    return grouped.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def _miles(value: int) -> str:
    """40000 → "40.000" (agrupamento pt-BR para milhas inteiras)."""
    return f"{value:,}".replace(",", ".")


class PurchaseCalculator:
    def __init__(self, milheiro_for: Callable[[str], float], default_program: str):
        """``milheiro_for``: programa → R$ por 1000 milhas (Settings.milheiro_for).
        ``default_program``: programa usado quando a oferta não declara o seu."""
        self.milheiro_for = milheiro_for
        self.default_program = default_program

    # ------------------------------------------------------------------ utils
    def program_of(self, offer: FlightOffer) -> str:
        return (offer.miles_program or self.default_program).lower()

    def miles_value_brl(self, miles: int, program: str) -> float:
        return round(miles / 1000 * self.milheiro_for(program), 2)

    def _option(
        self,
        strategy: Strategy,
        offer: FlightOffer,
        *,
        cash: float,
        miles: int,
        cabin_final: Cabin,
        notes: list[str],
    ) -> PurchaseOption:
        program = self.program_of(offer) if miles else None
        effective = round(cash + (self.miles_value_brl(miles, program) if program else 0.0), 2)
        return PurchaseOption(
            strategy=strategy,
            label=STRATEGY_LABELS[strategy],
            cabin_final=cabin_final,
            cash_brl=round(cash, 2),
            miles=miles,
            milheiro_brl=self.milheiro_for(program) if program else None,
            effective_total_brl=effective,
            breakeven_milheiro_brl=None,  # filled in evaluate()
            offer_key=offer_identity(offer),
            notes=notes,
            miles_program=program,
        )

    # ------------------------------------------------------------- strategies
    def business_cash(self, business: FlightOffer) -> PurchaseOption | None:
        if business.price_cash_brl is None:
            return None
        return self._option(
            Strategy.BUSINESS_CASH,
            business,
            cash=business.price_cash_brl,
            miles=0,
            # a cabine anunciada (executiva OU premium — o shelf superior)
            cabin_final=business.cabin,
            notes=[],
        )

    def economy_miles_upgrade(self, economy: FlightOffer) -> PurchaseOption | None:
        if economy.price_cash_brl is None or not economy.upgrade_miles:
            return None
        return self._option(
            Strategy.ECONOMY_MILES_UPGRADE,
            economy,
            cash=economy.price_cash_brl,
            miles=economy.upgrade_miles,
            cabin_final=Cabin.BUSINESS,
            notes=[f"upgrade de {_miles(economy.upgrade_miles)} milhas"],
        )

    def full_miles(self, offer: FlightOffer) -> PurchaseOption | None:
        if not offer.price_miles:
            return None
        return self._option(
            Strategy.FULL_MILES,
            offer,
            cash=offer.taxes_brl,
            miles=offer.price_miles,
            cabin_final=offer.cabin,
            notes=[
                f"{_miles(offer.price_miles)} milhas + R$ {_brl(offer.taxes_brl)} de taxas"
            ],
        )

    def economy_cash(self, economy: FlightOffer) -> PurchaseOption | None:
        """Linha de base premium: comprar a passagem anunciada em dinheiro.
        É o que garante opção de compra mesmo em ofertas só-metasearch
        (sem milhas, sem upgrade, sem shelf executiva)."""
        if economy.price_cash_brl is None:
            return None
        return self._option(
            Strategy.ECONOMY_CASH,
            economy,
            cash=economy.price_cash_brl,
            miles=0,
            cabin_final=economy.cabin,
            notes=[],
        )

    def economy_cash_upgrade(self, economy: FlightOffer) -> PurchaseOption | None:
        if economy.price_cash_brl is None or economy.upgrade_cash_brl is None:
            return None
        return self._option(
            Strategy.ECONOMY_CASH_UPGRADE,
            economy,
            cash=economy.price_cash_brl + economy.upgrade_cash_brl,
            miles=0,
            cabin_final=Cabin.BUSINESS,
            notes=[f"upgrade de R$ {_brl(economy.upgrade_cash_brl)}"],
        )

    # -------------------------------------------------------------- evaluate
    def evaluate(
        self,
        economy: FlightOffer | None,
        business: FlightOffer | None,
        request: SearchRequest,
    ) -> list[PurchaseOption]:
        """All viable strategies for one itinerary, ranked by effective cost."""
        options: list[PurchaseOption] = []
        if business is not None:
            for option in (self.business_cash(business), self.full_miles(business)):
                if option:
                    options.append(option)
        if economy is not None:
            for option in (
                self.economy_cash(economy),
                # award em econômica também é emissão em milhas — sem isto,
                # ofertas award-only de econômica nunca viravam opção
                self.full_miles(economy),
                self.economy_miles_upgrade(economy),
                self.economy_cash_upgrade(economy),
            ):
                if option:
                    options.append(option)

        # baseline de dinheiro POR CABINE FINAL: award de executiva compara
        # com executiva em dinheiro, não com a econômica (maçã com maçã)
        cash_by_cabin: dict[Cabin, float] = {}
        for option in options:
            if option.miles == 0:
                current = cash_by_cabin.get(option.cabin_final)
                if current is None or option.effective_total_brl < current:
                    cash_by_cabin[option.cabin_final] = option.effective_total_brl
        request_program = request.program.lower()
        for option in options:
            if option.miles > 0:
                program = option.miles_program or request_program
                milheiro = self.milheiro_for(program)
                # só a mesma cabine serve de baseline: comparar award de
                # executiva com econômica em dinheiro distorce o breakeven
                best_cash = cash_by_cabin.get(option.cabin_final)
                if best_cash is not None:
                    # milheiro at which this option's effective cost == best cash
                    option.breakeven_milheiro_brl = round(
                        max(0.0, (best_cash - option.cash_brl) / option.miles * 1000), 2
                    )
                    if milheiro <= (option.breakeven_milheiro_brl or 0):
                        option.notes.append(
                            f"vale a pena com milheiro ≤ R$ {option.breakeven_milheiro_brl:.2f}"
                        )
                else:
                    option.notes.append(
                        f"sem tarifa em dinheiro de {option.cabin_final.value} para "
                        "comparar — milheiro de equilíbrio indisponível"
                    )
                # o saldo informado é do programa da busca; milhas de outro
                # programa não podem ser julgadas por ele
                if program == request_program and request.miles_balance < option.miles:
                    missing = option.miles - request.miles_balance
                    option.notes.append(
                        f"saldo insuficiente: faltam {_miles(missing)} milhas"
                    )
                option.notes.append(
                    f"equivalente em dinheiro: R$ {_brl(self.miles_value_brl(option.miles, program))} "
                    f"(milheiro {program} R$ {_brl(milheiro)})"
                )

        options.sort(key=lambda o: o.effective_total_brl)
        return options
