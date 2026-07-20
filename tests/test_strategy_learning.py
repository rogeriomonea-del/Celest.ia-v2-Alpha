import asyncio
import csv
from datetime import date

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents import scrapers
from celestia_engine.agents.scrapers import CopaScraperAgent
from celestia_engine.config import Settings
from celestia_engine.models import FlightOffer, Route, Source, Cabin
from celestia_engine.providers.base import ProviderError
from celestia_engine.storage import rank_strategies, record_attempt
from celestia_engine.storage.strategy_stats import performance_summary

ROUTE = Route("GRU", "PTY", "CM")
DEPART = date(2026, 9, 20)
ALL = ["firecrawl_interact", "firecrawl_scrape", "playwright_local"]


def _settings(tmp_path, **kw):
    return Settings(strategy_csv=str(tmp_path / "strategy_performance.csv"), **kw)


def test_untried_strategies_keep_base_order(tmp_path):
    s = _settings(tmp_path)
    assert rank_strategies(s, "copa", ALL) == ALL  # sem histórico → ordem base


def test_learning_promotes_the_winner(tmp_path):
    s = _settings(tmp_path)
    # playwright falha 3x, firecrawl_scrape acerta 3x
    for _ in range(3):
        record_attempt(s, site="copa", strategy="playwright_local",
                       success=False, offers_found=0, duration_s=20)
        record_attempt(s, site="copa", strategy="firecrawl_scrape",
                       success=True, offers_found=8, duration_s=3)
    order = rank_strategies(s, "copa", ALL)
    # comprovadamente boa primeiro; não-testada (interact, prior 0.5) antes da ruim
    assert order[0] == "firecrawl_scrape"
    assert order.index("firecrawl_interact") < order.index("playwright_local")


def test_summary_reports_scores(tmp_path):
    s = _settings(tmp_path)
    record_attempt(s, site="latam", strategy="firecrawl_interact",
                   success=True, offers_found=5, duration_s=4)
    summary = performance_summary(s)
    assert "latam" in summary
    assert summary["latam"]["firecrawl_interact"] > 0.5


def _offer(strategy):
    return FlightOffer(
        carrier="CM", flight_numbers=("CM 1",), origin="GRU", destination="PTY",
        depart=DEPART, cabin=Cabin.ECONOMY, price_cash_brl=1500.0, source=Source.COPA,
        raw={},
    )


def test_agent_tries_ranked_order_and_falls_back(tmp_path, monkeypatch):
    s = _settings(tmp_path, firecrawl_api_key="fc-test")
    calls = []

    async def interact_fails(agent, route, depart):
        calls.append("firecrawl_interact")
        raise ProviderError("interact vazio")

    async def scrape_ok(agent, route, depart):
        calls.append("firecrawl_scrape")
        return [_offer("firecrawl_scrape")]

    async def pw_unused(agent, route, depart):  # pragma: no cover
        calls.append("playwright_local")
        return []

    monkeypatch.setitem(scrapers.STRATEGY_FUNCS, "firecrawl_interact", interact_fails)
    monkeypatch.setitem(scrapers.STRATEGY_FUNCS, "firecrawl_scrape", scrape_ok)
    monkeypatch.setitem(scrapers.STRATEGY_FUNCS, "playwright_local", pw_unused)

    agent = CopaScraperAgent(AgentContext(settings=s))
    offers = asyncio.run(agent.fetch_offers(ROUTE, DEPART))

    # tentou interact primeiro (ordem base), falhou, caiu para scrape e parou
    assert calls == ["firecrawl_interact", "firecrawl_scrape"]
    assert offers and offers[0].raw["strategy"] == "firecrawl_scrape"

    # os dois resultados foram gravados; próxima ordem promove o vencedor
    rows = list(csv.DictReader(open(s.strategy_csv, encoding="utf-8")))
    outcomes = {(r["strategy"], r["outcome"]) for r in rows}
    assert ("firecrawl_interact", "fail") in outcomes
    assert ("firecrawl_scrape", "success") in outcomes
    assert rank_strategies(s, "copa", ALL)[0] == "firecrawl_scrape"


def test_strategies_skipped_without_firecrawl_key(tmp_path):
    s = _settings(tmp_path)  # sem firecrawl key
    agent = CopaScraperAgent(AgentContext(settings=s))
    assert agent._available_strategies() == ["playwright_local"]


def test_disabled_interact_is_excluded_not_penalized(tmp_path):
    # FIRECRAWL_INTERACT=0 com chave presente: interact NÃO disputa
    s = _settings(tmp_path, firecrawl_api_key="fc", firecrawl_interact_enabled=False)
    agent = CopaScraperAgent(AgentContext(settings=s))
    available = agent._available_strategies()
    assert "firecrawl_interact" not in available
    assert available == ["firecrawl_scrape", "playwright_local"]
