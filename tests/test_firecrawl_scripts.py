import asyncio
from datetime import date

import pytest

from celestia_engine.config import Settings
from celestia_engine.models import Cabin, Route, Source
from celestia_engine.providers import firecrawl_scripts as fs
from celestia_engine.providers.base import ProviderNotConfigured
from celestia_engine.providers.firecrawl_interact import parse_interact_output

ROUTE = Route("GRU", "MCO", "CM", direct=False, via="PTY")
DEPART = date(2026, 11, 28)


def _parse(text, carrier="CM", program="connectmiles", source=Source.COPA):
    return parse_interact_output(
        text, carrier=carrier, program=program, route=ROUTE,
        depart=DEPART, source=source, usd_brl_rate=5.0,
    )


# --------------------------------------------------------------- registry/steps
def test_registry_has_expected_scripts():
    assert set(fs.SCRIPTS) == {
        "copa_direct", "latam_direct", "gol_direct", "azul_direct",
        "google_flights_search", "google_flights_calendar",
    }
    assert fs.SCRIPTS["copa_direct"].kind == "offers"
    assert fs.SCRIPTS["google_flights_calendar"].kind == "calendar"
    assert fs.SITE_SCRIPT == {
        "copa": "copa_direct", "latam": "latam_direct",
        "gol": "gol_direct", "azul": "azul_direct",
    }


def test_gol_and_azul_steps_mention_route_date_and_points():
    for name, points_word in (("gol_direct", "smiles"), ("azul_direct", "tudoazul")):
        steps = fs.SCRIPTS[name].build_steps(
            route=ROUTE, depart=DEPART, cabin=Cabin.ECONOMY)
        joined = " ".join(steps)
        assert "GRU" in joined and "MCO" in joined
        assert "28/11/2026" in joined            # data no formato BR
        assert points_word in joined.lower()     # pede dinheiro E milhas/pontos


def test_copa_steps_mention_route_date_and_ask_for_miles():
    steps = fs.SCRIPTS["copa_direct"].build_steps(route=ROUTE, depart=DEPART, cabin=Cabin.ECONOMY)
    joined = " ".join(steps)
    assert "GRU" in joined and "MCO" in joined
    assert "28/11/2026" in joined            # data no formato BR
    assert "milhas" in joined.lower()        # extração pede dinheiro E milhas


def test_google_flights_search_steps_set_cabin_and_iso_date():
    steps = fs.SCRIPTS["google_flights_search"].build_steps(
        route=ROUTE, depart=DEPART, cabin=Cabin.BUSINESS)
    joined = " ".join(steps)
    assert "Executiva" in joined
    assert "2026-11-28" in joined
    assert "companhias" in joined.lower()    # metasearch multi-companhia


def test_calendar_steps_carry_window_bounds():
    steps = fs.SCRIPTS["google_flights_calendar"].build_steps(
        origin="GRU", destination="MCO", cabin=Cabin.ECONOMY,
        start=date(2026, 9, 1), end=date(2026, 9, 30))
    joined = " ".join(steps)
    assert "2026-09-01" in joined and "2026-09-30" in joined


# ------------------------------------------------------------- rich extraction
def test_rich_parse_miles_taxes_layovers_and_arrival():
    text = (
        '{"offers":[{"airline":"COPA","airline_iata":"CM","flight_numbers":["CM 702"],'
        '"cabin":"business","fare_brand":"Business Full","price":800,"currency":"USD",'
        '"price_miles":95000,"taxes":45,"departure_time":"01:40","arrival_time":"11:20",'
        '"arrival_day_offset":1,"duration_minutes":680,"stops":1,'
        '"layovers":[{"airport":"pty","minutes":95}],"aircraft":"B737","seats_left":3}]}'
    )
    offer = _parse(text)[0]
    assert offer.cabin is Cabin.BUSINESS
    assert offer.price_cash_brl == 4000.0     # 800 USD * 5
    assert offer.price_miles == 95000
    assert offer.taxes_brl == 225.0           # 45 USD * 5
    assert offer.seats_left == 3
    assert offer.raw["arrival_time"] == "11:20"
    assert offer.raw["arrival_day_offset"] == 1
    assert offer.raw["fare_brand"] == "Business Full"
    assert offer.raw["aircraft"] == "B737"
    assert offer.raw["layovers"] == [{"airport": "PTY", "minutes": 95}]


def test_miles_only_offer_is_kept():
    text = ('{"offers":[{"airline":"COPA","cabin":"economy",'
            '"price_miles":60000,"taxes":180,"currency":"BRL"}]}')
    offer = _parse(text)[0]
    assert offer.price_cash_brl is None
    assert offer.price_miles == 60000
    assert offer.taxes_brl == 180.0


def test_offer_without_cash_or_miles_is_dropped():
    assert _parse('{"offers":[{"airline":"COPA","cabin":"economy","currency":"BRL"}]}') == []


def test_airline_iata_wins_carrier_resolution():
    # metasearch: rótulo desconhecido mas IATA explícito
    text = ('{"offers":[{"airline":"Some Charter","airline_iata":"JJ",'
            '"cabin":"economy","price":1000,"currency":"BRL"}]}')
    assert _parse(text, carrier="*")[0].carrier == "JJ"


def test_premium_cabin_recognized():
    text = '{"offers":[{"airline":"LATAM","cabin":"premium economy","price":2000,"currency":"BRL"}]}'
    assert _parse(text, carrier="LA")[0].cabin is Cabin.PREMIUM


# ------------------------------------------------------------------- executor
def test_run_offer_script_requires_firecrawl():
    with pytest.raises(ProviderNotConfigured):
        asyncio.run(fs.run_offer_script(
            Settings(), "copa_direct", carrier="CM", program="connectmiles",
            source=Source.COPA, route=ROUTE, depart=DEPART))


def test_run_offer_script_executes_and_parses(monkeypatch):
    canned = ('{"offers":[{"airline":"COPA","airline_iata":"CM","cabin":"economy",'
              '"price":1200,"currency":"BRL"}]}')

    async def fake_run_steps(settings, url, steps):
        assert "GRU" in " ".join(steps)      # os passos carregam a rota
        return canned

    monkeypatch.setattr(fs, "_run_steps", fake_run_steps)
    offers = asyncio.run(fs.run_offer_script(
        Settings(firecrawl_api_key="fc"), "copa_direct", carrier="CM",
        program="connectmiles", source=Source.COPA, route=ROUTE, depart=DEPART))
    assert len(offers) == 1 and offers[0].price_cash_brl == 1200.0


def test_google_flights_offers_are_metasearch(monkeypatch):
    canned = ('{"offers":['
              '{"airline":"TAP","airline_iata":"TP","cabin":"economy","price":3100,"currency":"BRL"},'
              '{"airline":"Azul","airline_iata":"AD","cabin":"economy","price":2900,"currency":"BRL"}]}')

    async def fake_run_steps(settings, url, steps):
        return canned

    monkeypatch.setattr(fs, "_run_steps", fake_run_steps)
    offers = asyncio.run(fs.run_google_flights_offers(
        Settings(firecrawl_api_key="fc"), route=ROUTE, depart=DEPART))
    assert {o.carrier for o in offers} == {"TP", "AD"}
    assert all(o.source is Source.GOOGLE_FLIGHTS for o in offers)
