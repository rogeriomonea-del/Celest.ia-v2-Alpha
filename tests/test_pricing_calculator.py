from datetime import date

import pytest

from celestia_engine.models import Cabin, FlightOffer, SearchRequest, Source, Strategy
from celestia_engine.pricing import PurchaseCalculator


def _offers():
    common = dict(
        carrier="CM",
        flight_numbers=("CM 702",),
        origin="GRU",
        destination="PTY",
        depart=date(2026, 9, 10),
        taxes_brl=200.0,
        miles_program="connectmiles",
        source=Source.COPA,
    )
    economy = FlightOffer(
        cabin=Cabin.ECONOMY,
        price_cash_brl=3000.0,
        upgrade_miles=40_000,
        upgrade_cash_brl=2000.0,
        **common,
    )
    business = FlightOffer(
        cabin=Cabin.BUSINESS,
        price_cash_brl=9000.0,
        price_miles=220_000,
        **common,
    )
    return economy, business


def _request(miles_balance=1_000_000):
    return SearchRequest(
        origin="GRU",
        destination="PTY",
        depart=date(2026, 9, 10),
        miles_balance=miles_balance,
    )


def test_five_strategies_and_effective_costs():
    economy, business = _offers()
    options = PurchaseCalculator(30.0).evaluate(economy, business, _request())

    by_strategy = {o.strategy: o for o in options}
    assert set(by_strategy) == {
        Strategy.BUSINESS_CASH,
        Strategy.ECONOMY_MILES_UPGRADE,
        Strategy.FULL_MILES,
        Strategy.ECONOMY_CASH_UPGRADE,
        Strategy.ECONOMY_CASH,
    }

    assert by_strategy[Strategy.ECONOMY_CASH].effective_total_brl == 3000.0
    assert by_strategy[Strategy.BUSINESS_CASH].effective_total_brl == 9000.0
    # 3000 cash + 40k miles * R$30/1000 = 3000 + 1200
    assert by_strategy[Strategy.ECONOMY_MILES_UPGRADE].effective_total_brl == 4200.0
    # taxes 200 + 220k miles * R$30/1000 = 200 + 6600
    assert by_strategy[Strategy.FULL_MILES].effective_total_brl == 6800.0
    assert by_strategy[Strategy.ECONOMY_CASH_UPGRADE].effective_total_brl == 5000.0

    # ranked ascending by effective cost — a linha de base (econômica em
    # dinheiro) vem primeiro por ser a mais barata
    assert [o.strategy for o in options] == [
        Strategy.ECONOMY_CASH,
        Strategy.ECONOMY_MILES_UPGRADE,
        Strategy.ECONOMY_CASH_UPGRADE,
        Strategy.FULL_MILES,
        Strategy.BUSINESS_CASH,
    ]


def test_cash_only_metasearch_offer_still_gets_an_option():
    # oferta só-metasearch: econômica em dinheiro, sem milhas nem upgrades —
    # o usuário nunca fica com 0 opções de compra
    economy, _ = _offers()
    economy.upgrade_miles = None
    economy.upgrade_cash_brl = None
    options = PurchaseCalculator(30.0).evaluate(economy, None, _request())
    assert [o.strategy for o in options] == [Strategy.ECONOMY_CASH]
    assert options[0].effective_total_brl == 3000.0


def test_breakeven_milheiro():
    economy, business = _offers()
    options = PurchaseCalculator(30.0).evaluate(economy, business, _request())
    by_strategy = {o.strategy: o for o in options}

    # best cash-only option is economy + cash upgrade (5000)
    upgrade = by_strategy[Strategy.ECONOMY_MILES_UPGRADE]
    assert upgrade.breakeven_milheiro_brl == pytest.approx(50.0)
    assert any("vale a pena" in note for note in upgrade.notes)

    award = by_strategy[Strategy.FULL_MILES]
    assert award.breakeven_milheiro_brl == pytest.approx(21.82, abs=0.01)
    assert not any("vale a pena" in note for note in award.notes)


def test_miles_value_shown_in_brl():
    economy, business = _offers()
    options = PurchaseCalculator(30.0).evaluate(economy, business, _request())
    award = next(o for o in options if o.strategy is Strategy.FULL_MILES)
    assert any("equivalente em dinheiro" in note for note in award.notes)
    assert any("milheiro R$ 30.00" in note.replace(",", ".") for note in award.notes)


def test_insufficient_balance_note():
    economy, business = _offers()
    options = PurchaseCalculator(30.0).evaluate(economy, business, _request(miles_balance=30_000))
    upgrade = next(o for o in options if o.strategy is Strategy.ECONOMY_MILES_UPGRADE)
    assert any("faltam 10.000 milhas" in note for note in upgrade.notes)


def test_missing_data_skips_strategies():
    economy, business = _offers()
    economy.upgrade_miles = None
    business.price_miles = None
    options = PurchaseCalculator(30.0).evaluate(economy, business, _request())
    strategies = {o.strategy for o in options}
    assert Strategy.ECONOMY_MILES_UPGRADE not in strategies
    assert Strategy.FULL_MILES not in strategies
    assert {Strategy.BUSINESS_CASH, Strategy.ECONOMY_CASH_UPGRADE} <= strategies


def test_invalid_milheiro_rejected():
    with pytest.raises(ValueError):
        PurchaseCalculator(0)
