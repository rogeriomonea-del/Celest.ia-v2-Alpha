import asyncio
from datetime import date

import pytest

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.scrapers import CopaScraperAgent
from celestia_engine.config import Settings
from celestia_engine.models import Cabin, FlightOffer, Route, Source
from celestia_engine.providers import firecrawl
from celestia_engine.providers.base import ProviderError, ProviderNotConfigured
from celestia_engine.providers.firecrawl import parse_firecrawl_payload

ROUTE = Route("GRU", "PTY", "CM", direct=True)
DEPART = date(2026, 9, 10)

FIRECRAWL_PAYLOAD = {
    "success": True,
    "data": {
        "json": {
            "offers": [
                {
                    "flight_numbers": ["CM 702"],
                    "price_cash_brl": 4321.5,
                    "taxes_brl": 310.2,
                    "price_miles": 65000,
                    "seats_left": 4,
                },
                {
                    "flight_numbers": ["481"],
                    "price_miles": 72000,
                    "taxes_brl": 250.0,
                },
                {"flight_numbers": ["CM 999"]},  # sem preço: descartada
            ]
        }
    },
}


def _parse(payload):
    return parse_firecrawl_payload(
        payload,
        carrier="CM",
        program="connectmiles",
        route=ROUTE,
        depart=DEPART,
        cabin=Cabin.ECONOMY,
        source=Source.COPA,
    )


def test_parse_firecrawl_payload_maps_offers():
    offers = _parse(FIRECRAWL_PAYLOAD)
    assert len(offers) == 2

    first, second = offers
    assert first.price_cash_brl == 4321.5
    assert first.taxes_brl == 310.2
    assert first.price_miles == 65000
    assert first.miles_program == "connectmiles"
    assert first.seats_left == 4
    assert first.flight_numbers == ("CM 702",)
    assert first.raw["via"] == "firecrawl"

    # número "481" ganha prefixo da companhia; oferta só-milhas é válida
    assert second.flight_numbers == ("CM 481",)
    assert second.price_cash_brl is None
    assert second.price_miles == 72000


def test_parse_firecrawl_error_payload_raises():
    with pytest.raises(ProviderError):
        _parse({"success": False, "error": "rate limited"})


def test_scrape_without_key_raises_not_configured():
    settings = Settings()  # sem FIRECRAWL_API_KEY
    with pytest.raises(ProviderNotConfigured):
        asyncio.run(
            firecrawl.scrape(
                settings, site="copa", route=ROUTE, depart=DEPART, cabin=Cabin.ECONOMY
            )
        )


def _sentinel_offer(via: str) -> FlightOffer:
    return FlightOffer(
        carrier="CM",
        flight_numbers=("CM 1",),
        origin="GRU",
        destination="PTY",
        depart=DEPART,
        cabin=Cabin.ECONOMY,
        price_cash_brl=1000.0,
        source=Source.COPA,
        raw={"via": via},
    )


def _fc_settings(tmp_path):
    # firecrawl_scrape isolado: só interact + playwright, CSV de estratégia próprio
    return Settings(
        firecrawl_api_key="fc-test",
        scrape_strategies="firecrawl_scrape,playwright_local",
        strategy_csv=str(tmp_path / "strat.csv"),
    )


def test_agent_prefers_firecrawl_when_configured(monkeypatch, tmp_path):
    async def fake_firecrawl(settings, **kwargs):
        return [_sentinel_offer("firecrawl")]

    async def fail_playwright(settings, **kwargs):  # pragma: no cover - must not run
        raise AssertionError("playwright não deveria ser chamado")

    monkeypatch.setattr(firecrawl, "scrape", fake_firecrawl)
    monkeypatch.setattr(
        "celestia_engine.agents.scrapers.scrape_airline", fail_playwright
    )

    agent = CopaScraperAgent(AgentContext(settings=_fc_settings(tmp_path)))
    offers = asyncio.run(agent.fetch_offers(ROUTE, DEPART))
    assert offers and all(o.raw["via"] == "firecrawl" for o in offers)
    assert offers[0].raw["strategy"] == "firecrawl_scrape"


def test_agent_falls_back_to_playwright_on_firecrawl_error(monkeypatch, tmp_path):
    async def failing_firecrawl(settings, **kwargs):
        raise ProviderError("bloqueado")

    async def fake_playwright(settings, **kwargs):
        return [_sentinel_offer("playwright")]

    monkeypatch.setattr(firecrawl, "scrape", failing_firecrawl)
    monkeypatch.setattr(
        "celestia_engine.agents.scrapers.scrape_airline", fake_playwright
    )

    ctx = AgentContext(settings=_fc_settings(tmp_path))
    agent = CopaScraperAgent(ctx)
    offers = asyncio.run(agent.fetch_offers(ROUTE, DEPART))
    assert offers and all(o.raw["via"] == "playwright" for o in offers)
    assert offers[0].raw["strategy"] == "playwright_local"
    assert any("firecrawl_scrape falhou" in line for line in ctx.log_lines)
