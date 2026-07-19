import asyncio
from datetime import date

import pytest

from celestia_engine.config import Settings
from celestia_engine.models import Cabin, Route
from celestia_engine.providers import google_flights2, skyscanner
from celestia_engine.providers.base import ProviderNotConfigured

ROUTE = Route("GRU", "LIS", "LA", direct=True)
DEPART = date(2026, 9, 10)

GF2_PAYLOAD = {
    "status": True,
    "data": {
        "itineraries": {
            "topFlights": [
                {"price": 3890, "flights": [{"flight_number": "LA 8084"}]},
                {"price": {"value": 4120.5}},
            ],
            "otherFlights": [
                {"price": 4590.0},
                {"price": "invalid"},
                "garbage",
            ],
        }
    },
}


def test_gf2_parse_payload_handles_both_price_shapes():
    quotes = google_flights2.parse_payload(GF2_PAYLOAD, ROUTE, DEPART, Cabin.BUSINESS)
    assert [q.price_brl for q in quotes] == [3890.0, 4120.5, 4590.0]
    assert all(q.route is ROUTE and q.cabin is Cabin.BUSINESS for q in quotes)


def test_gf2_parse_flat_list_variant():
    payload = {"data": {"itineraries": [{"price": 1500}]}}
    quotes = google_flights2.parse_payload(payload, ROUTE, DEPART, Cabin.ECONOMY)
    assert len(quotes) == 1 and quotes[0].price_brl == 1500.0


def test_gf2_requires_rapidapi_key():
    with pytest.raises(ProviderNotConfigured):
        asyncio.run(google_flights2.quote(Settings(), ROUTE, DEPART, Cabin.ECONOMY))


def test_skyscanner_rapidapi_host_is_configurable(monkeypatch):
    captured = {}

    async def fake_get_json(url, *, params=None, headers=None, timeout_s=None, **kw):
        captured["url"] = url
        captured["params"] = params
        captured["headers"] = headers
        return {"data": {"itineraries": [{"price": {"raw": 2000.0}}]}}

    monkeypatch.setattr(skyscanner, "get_json", fake_get_json)
    settings = Settings(
        rapidapi_key="rk-test", rapidapi_sky_host="flights-sky.p.rapidapi.com"
    )
    quotes = asyncio.run(skyscanner.quote(settings, ROUTE, DEPART, Cabin.ECONOMY))

    assert quotes and quotes[0].price_brl == 2000.0
    assert captured["url"].startswith("https://flights-sky.p.rapidapi.com/")
    assert captured["headers"]["X-RapidAPI-Host"] == "flights-sky.p.rapidapi.com"
    # both wrappers' param names travel together
    assert captured["params"]["originSkyId"] == "GRU"
    assert captured["params"]["fromEntityId"] == "GRU"
    assert captured["params"]["date"] == captured["params"]["departDate"]
