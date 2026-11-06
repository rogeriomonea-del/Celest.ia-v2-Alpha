"""F1 (cabine só itera com {cabin} no template) e F7 (timeout no meio da escada)."""

import asyncio
import csv
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from celestia_engine.agents import scrapers
from celestia_engine.agents.base import AgentContext
from celestia_engine.models import Cabin, FlightOffer, Route

DEPART = date(2030, 3, 10)


def _fake_fetch(calls):
    async def fetch(settings, *, site, route, depart, cabin):
        calls.append(cabin)
        return [
            FlightOffer(
                carrier="XX", flight_numbers=("XX 1",), origin=route.origin,
                destination=route.destination, depart=depart, cabin=cabin,
                price_cash_brl=1000.0,
            )
        ]

    return fetch


@pytest.mark.parametrize(
    "agent_cls, strategy, patch_target, expected",
    [
        (scrapers.CopaScraperAgent, "firecrawl_scrape", "firecrawl", [Cabin.ECONOMY]),
        (scrapers.GolScraperAgent, "playwright_local", "playwright", [Cabin.ECONOMY]),
        (scrapers.AzulScraperAgent, "firecrawl_scrape", "firecrawl", [Cabin.ECONOMY]),
        (
            scrapers.LatamScraperAgent, "firecrawl_scrape", "firecrawl",
            [Cabin.ECONOMY, Cabin.BUSINESS],
        ),
    ],
)
def test_cabin_pass_only_when_template_has_cabin(
    settings, monkeypatch, agent_cls, strategy, patch_target, expected
):
    calls: list[Cabin] = []
    if patch_target == "firecrawl":
        monkeypatch.setattr(scrapers.firecrawl, "scrape", _fake_fetch(calls))
    else:
        monkeypatch.setattr(scrapers, "scrape_airline", _fake_fetch(calls))
    cfg = replace(settings, firecrawl_api_key="test-key", scrape_strategies=strategy)
    agent = agent_cls(AgentContext(settings=cfg))

    offers = asyncio.run(agent.fetch_offers(Route("GRU", "PTY", agent.carrier), DEPART))

    assert calls == expected
    assert [o.cabin for o in offers] == expected


def _rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def test_subagent_timeout_mid_ladder_is_recorded_as_failure(settings, monkeypatch):
    async def hang(agent, route, depart):
        await asyncio.Event().wait()

    for name in ("firecrawl_scrape", "playwright_local"):
        monkeypatch.setitem(scrapers.STRATEGY_FUNCS, name, hang)
    cfg = replace(
        settings,
        firecrawl_api_key="test-key",
        scrape_strategies="firecrawl_scrape,playwright_local",
        subagent_timeout_s=0.2,
    )
    ctx = AgentContext(settings=cfg)
    agent = scrapers.CopaScraperAgent(ctx)
    route = Route("GRU", "PTY", "CM")

    result = asyncio.run(ctx.spawn("test", "copa", lambda: agent.fetch_offers(route, DEPART)))

    assert isinstance(result, asyncio.TimeoutError)
    perf = _rows(Path(cfg.strategy_csv))
    assert [(r["site"], r["outcome"]) for r in perf] == [("copa", "fail")]
    failures = _rows(Path(cfg.strategy_csv).parent / "search_failures.csv")
    assert [(r["strategy"], r["error"]) for r in failures] == [(perf[0]["strategy"], "timeout")]


def test_parent_cancel_mid_ladder_is_not_recorded_as_timeout(settings, monkeypatch):
    running: list[asyncio.Event] = []

    async def hang(agent, route, depart):
        running[0].set()
        await asyncio.Event().wait()

    for name in ("firecrawl_scrape", "playwright_local"):
        monkeypatch.setitem(scrapers.STRATEGY_FUNCS, name, hang)
    cfg = replace(
        settings,
        firecrawl_api_key="test-key",
        scrape_strategies="firecrawl_scrape,playwright_local",
        subagent_timeout_s=30,  # o teto do subagente NÃO estoura
    )
    ctx = AgentContext(settings=cfg)
    agent = scrapers.CopaScraperAgent(ctx)
    route = Route("GRU", "PTY", "CM")

    async def main():
        running.append(asyncio.Event())
        search = asyncio.create_task(
            ctx.spawn("test", "copa", lambda: agent.fetch_offers(route, DEPART))
        )
        await running[0].wait()
        search.cancel()  # a busca pai é cancelada (ex.: cliente desconectou)
        with pytest.raises(asyncio.CancelledError):
            await search

    asyncio.run(asyncio.wait_for(main(), timeout=5))

    # o cancelamento propagou, mas a estratégia não foi punida por "timeout"
    assert not Path(cfg.strategy_csv).exists()
    assert not (Path(cfg.strategy_csv).parent / "search_failures.csv").exists()
