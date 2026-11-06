"""F3 (milheiro do programa da oferta) e F4 (breakeven só na mesma cabine)."""

from datetime import date

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.miles import MilesMathAgent
from celestia_engine.models import Cabin, FlightOffer, SearchRequest, Strategy

DEPART = date(2030, 3, 10)


def _offer(**kw) -> FlightOffer:
    base = dict(
        carrier="LA", flight_numbers=("LA 8084",), origin="GRU", destination="LIS",
        depart=DEPART, cabin=Cabin.ECONOMY,
    )
    base.update(kw)
    return FlightOffer(**base)


def _options(settings, offers, **req):
    request = SearchRequest(origin="GRU", destination="LIS", depart=DEPART, **req)
    return MilesMathAgent(AgentContext(settings=settings)).evaluate_offers(offers, request)


def _award(options):
    [award] = [o for o in options if o.strategy is Strategy.FULL_MILES]
    return award


def test_award_uses_offer_program_milheiro_not_request_program(settings):
    award_offer = _offer(price_miles=60_000, taxes_brl=200.0, miles_program="latampass")
    award = _award(_options(settings, [award_offer], program="connectmiles"))
    assert award.milheiro_brl == 29.0  # latampass, não connectmiles (34)
    assert award.effective_total_brl == 200.0 + 60 * 29.0
    # o saldo informado é de ConnectMiles: não julga milhas LATAM
    assert not any("saldo insuficiente" in n for n in award.notes)


def test_offer_without_program_falls_back_to_request_program(settings):
    award_offer = _offer(price_miles=60_000, taxes_brl=200.0, miles_program=None)
    award = _award(
        _options(settings, [award_offer], program="connectmiles", miles_balance=10_000)
    )
    assert award.milheiro_brl == 34.0
    assert award.effective_total_brl == 200.0 + 60 * 34.0
    assert any("saldo insuficiente: faltam 50.000 milhas" in n for n in award.notes)


def test_breakeven_is_none_without_same_cabin_cash(settings):
    economy_cash = _offer(price_cash_brl=1500.0)
    business_award = _offer(
        cabin=Cabin.BUSINESS, price_miles=100_000, taxes_brl=300.0, miles_program="latampass"
    )
    award = _award(_options(settings, [economy_cash, business_award], program="latampass"))
    assert award.cabin_final is Cabin.BUSINESS
    assert award.breakeven_milheiro_brl is None  # não compara com a econômica
    assert any("milheiro de equilíbrio indisponível" in n for n in award.notes)


def test_breakeven_against_same_cabin_cash(settings):
    economy_cash = _offer(price_cash_brl=1500.0)
    business = _offer(
        cabin=Cabin.BUSINESS, price_cash_brl=5300.0, price_miles=100_000, taxes_brl=300.0,
        miles_program="latampass",
    )
    award = _award(_options(settings, [economy_cash, business], program="latampass"))
    # (5300 - 300) / 100.000 * 1000 = 50
    assert award.breakeven_milheiro_brl == 50.0
    assert any("vale a pena com milheiro ≤ R$ 50.00" in n for n in award.notes)
