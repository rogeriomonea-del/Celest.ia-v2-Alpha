"""Busca mock ponta a ponta (orquestrador e API HTTP), offline e determinística."""

import asyncio
from dataclasses import replace
from datetime import date

from fastapi.testclient import TestClient

from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.api import create_app
from celestia_engine.models import Cabin, SearchRequest

DEPART = date(2030, 3, 10)


def _mock(settings):
    return replace(settings, mock_mode=True)


def _summary(report):
    return (
        [(o.itinerary_key(), o.cabin.value, o.price_cash_brl, o.price_miles) for o in report.offers],
        [(o.strategy.value, o.offer_key, o.effective_total_brl) for o in report.options],
    )


def test_mock_search_end_to_end_is_deterministic(settings):
    request = SearchRequest(
        origin="GRU", destination="LIS", depart=DEPART, cabin_target=Cabin.BUSINESS,
        program="latampass",
    )
    first = asyncio.run(Orchestrator(_mock(settings)).search(request))
    second = asyncio.run(Orchestrator(_mock(settings)).search(request))

    assert len(first.offers) == 5
    assert len(first.options) == 9
    assert _summary(first) == _summary(second)
    # toda oferta com preço em dinheiro gera ao menos uma opção
    priced = {o.itinerary_key() for o in first.offers if o.price_cash_brl}
    assert priced <= {o.offer_key for o in first.options}
    costs = [o.effective_total_brl for o in first.options]
    assert costs == sorted(costs)


def test_api_mock_search_shape(settings):
    client = TestClient(create_app(_mock(settings)))
    response = client.post(
        "/api/search",
        json={"origin": "gru", "destination": "LIS", "depart": DEPART.isoformat(),
              "cabin": "business", "milesBalance": 0, "program": "latampass"},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "mode", "flights", "lastResort", "options", "quotes", "stats", "agentLog",
    }
    assert body["mode"] == "mock"
    assert body["flights"] and body["options"]
    ids = [flight["id"] for flight in body["flights"]]
    assert len(ids) == len(set(ids))
    assert body["lastResort"] is None


def test_api_rejects_bad_iata(settings):
    client = TestClient(create_app(_mock(settings)))
    response = client.post(
        "/api/search", json={"origin": "GR1", "destination": "LIS", "depart": "2030-03-10"}
    )
    assert response.status_code == 422
