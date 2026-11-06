"""F5: placeholders de número de voo não colidem no pareamento nem no id."""

from datetime import date

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.miles import MilesMathAgent
from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.api import _flight_json
from celestia_engine.models import (
    Cabin,
    FlightOffer,
    SearchRequest,
    Strategy,
    offer_identity,
)

DEPART = date(2030, 3, 10)


def _cm(price: float, numbers=("CM ?",), cabin=Cabin.ECONOMY) -> FlightOffer:
    return FlightOffer(
        carrier="CM", flight_numbers=numbers, origin="GRU", destination="MCO",
        depart=DEPART, cabin=cabin, price_cash_brl=price,
    )


def test_placeholder_offers_each_get_options_and_distinct_ids(settings):
    kept = Orchestrator(settings)._audit([_cm(2000.0), _cm(3500.0)])
    assert len(kept) == 2

    request = SearchRequest(origin="GRU", destination="MCO", depart=DEPART)
    options = MilesMathAgent(AgentContext(settings=settings)).evaluate_offers(kept, request)
    cash = sorted(o.cash_brl for o in options if o.strategy is Strategy.ECONOMY_CASH)
    assert cash == [2000.0, 3500.0]
    assert len({o.offer_key for o in options}) == 2

    ids = [_flight_json(offer, settings, 30.0)["id"] for offer in kept]
    assert len(set(ids)) == 2


def test_real_flight_numbers_keep_plain_key_and_pair_cabins(settings):
    economy = _cm(2000.0, numbers=("CM 702",))
    business = _cm(7000.0, numbers=("CM 702",), cabin=Cabin.BUSINESS)
    assert offer_identity(economy) == economy.itinerary_key()
    request = SearchRequest(origin="GRU", destination="MCO", depart=DEPART)
    options = MilesMathAgent(AgentContext(settings=settings)).evaluate_offers(
        [economy, business], request
    )
    assert {o.offer_key for o in options} == {economy.itinerary_key()}
    assert {o.strategy for o in options} == {Strategy.ECONOMY_CASH, Strategy.BUSINESS_CASH}


def test_metasearch_pair_fallback_counts_as_placeholder():
    a = _cm(2000.0, numbers=("GRU-MCO",))
    assert offer_identity(a) != offer_identity(_cm(2100.0, numbers=("GRU-MCO",)))
    # estável: mesmos dados, mesma chave
    assert offer_identity(a) == offer_identity(_cm(2000.0, numbers=("GRU-MCO",)))
