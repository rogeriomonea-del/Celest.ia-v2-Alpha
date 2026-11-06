"""F6: o calendário respeita o teto do subagente e o Interact cabe nele."""

import asyncio
import time
from dataclasses import replace
from datetime import date, timedelta

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.flex_scout import FlexDateScoutAgent, _window_fallback
from celestia_engine.models import Flexibility, SearchRequest
from celestia_engine.providers import firecrawl_interact


def test_hanging_calendar_falls_back_within_subagent_budget(settings, monkeypatch):
    async def hang(*args, **kwargs):
        await asyncio.Event().wait()

    monkeypatch.setattr(firecrawl_interact, "scan_calendar", hang)
    cfg = replace(settings, subagent_timeout_s=1)
    request = SearchRequest(
        origin="GRU", destination="LIS", depart=date.today() + timedelta(days=30),
        flexibility=Flexibility(enabled=True, preset="1w"),
    )
    scout = FlexDateScoutAgent(AgentContext(settings=cfg))

    started = time.monotonic()
    # guarda externa: sem o teto, o teste falha em 5s em vez de travar
    dates = asyncio.run(asyncio.wait_for(scout.cheapest_dates(request), timeout=5))
    elapsed = time.monotonic() - started

    start, end = request.flexibility.resolve_window(request.depart)
    assert dates == _window_fallback(request, start, end)
    assert elapsed < 3


def test_interact_timeouts_fit_subagent_budget(settings):
    open_s, step_s = firecrawl_interact.interact_timeouts(replace(settings, subagent_timeout_s=240))
    assert open_s <= 30
    assert open_s + firecrawl_interact.BUDGETED_STEPS * step_s + 10 <= 240
    # sem teto (0): valores históricos
    assert firecrawl_interact.interact_timeouts(replace(settings, subagent_timeout_s=0)) == (
        40.0, 150.0,
    )


def test_open_and_steps_use_derived_timeouts(settings, monkeypatch):
    calls = []

    async def fake_post_json(url, *, json_body, headers=None, timeout_s=20.0, retries=3):
        calls.append((url.rsplit("/", 1)[-1], timeout_s, retries))
        return {"data": {"metadata": {"scrapeId": "abc"}, "output": "{}"}}

    monkeypatch.setattr(firecrawl_interact, "post_json", fake_post_json)
    cfg = replace(settings, firecrawl_api_key="k", subagent_timeout_s=100)

    asyncio.run(firecrawl_interact.open_session(cfg, "https://example.test"))
    asyncio.run(firecrawl_interact.interact(cfg, "abc", "passo"))

    assert calls == [("scrape", 25.0, 1), ("interact", 20.0, 1)]
