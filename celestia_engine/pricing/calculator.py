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
"""

from __future__ import annotations

from ..models import (
    Cabin,
    FlightOffer,
    PurchaseOption,
    SearchRequest,
    Strategy,
    STRATEGY_LABELS,
)


def _brl(value: float) -> str:
    """1234.5 → "1.234,50" (pt-BR). O replace ingênuo gerava "1.234.50"."""
    grouped = f"{value:,.2f}"  # 1,234.50
    return grouped.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def _miles(value: int) -> str:
    """40000 → "40.000" (agrupamento pt-BR para milhas inteiras)."""
    return f"{value:,}".replace(",", ".")


class PurchaseCalculator:
    def __init__(self, milheiro_brl_per_1000: float):
        if milheiro_brl_per_1000 <= 0:
            raise ValueError("milheiro deve ser positivo")
        self.milheiro = milheiro_brl_per_1000

    # ------------------------------------------------------------------ utils
    def miles_value_brl(self, miles: int) -> float:
        return round(miles / 1000 * self.milheiro, 2)

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
        effective = round(cash + self.miles_value_brl(miles), 2)
        return PurchaseOption(
            strategy=strategy,
            label=STRATEGY_LABELS[strategy],
            cabin_final=cabin_final,
            cash_brl=round(cash, 2),
            miles=miles,
            milheiro_brl=self.milheiro if miles else None,
            effective_total_brl=effective,
            breakeven_milheiro_brl=None,  # filled in evaluate()
            offer_key=offer.itinerary_key(),
            notes=notes,
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
        best_cash_any = min(cash_by_cabin.values(), default=None)
        for option in options:
            if option.miles > 0:
                best_cash = cash_by_cabin.get(option.cabin_final, best_cash_any)
                if best_cash is not None:
                    # milheiro at which this option's effective cost == best cash
                    option.breakeven_milheiro_brl = round(
                        max(0.0, (best_cash - option.cash_brl) / option.miles * 1000), 2
                    )
                    if self.milheiro <= (option.breakeven_milheiro_brl or 0):
                        option.notes.append(
                            f"vale a pena com milheiro ≤ R$ {option.breakeven_milheiro_brl:.2f}"
                        )
                if request.miles_balance < option.miles:
                    missing = option.miles - request.miles_balance
                    option.notes.append(
                        f"saldo insuficiente: faltam {_miles(missing)} milhas"
                    )
                option.notes.append(
                    f"equivalente em dinheiro: R$ {_brl(self.miles_value_brl(option.miles))} "
                    f"(milheiro R$ {_brl(self.milheiro)})"
                )

        options.sort(key=lambda o: o.effective_total_brl)
        return options
