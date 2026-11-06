"""F6: o calendário respeita o teto do subagente e o Interact cabe nele."""

import asyncio
import time
from dataclasses import replace
from datetime import date, timedelta

import pytest

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.flex_scout import FlexDateScoutAgent, _window_fallback
from celestia_engine.models import Flexibility, SearchRequest
from celestia_engine.providers import firecrawl_interact, firecrawl_scripts
from celestia_engine.providers.base import ProviderError


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
    # comportamento mudou (F6): o 2º valor virou o orçamento TOTAL dos passos
    open_s, steps_s = firecrawl_interact.interact_timeouts(replace(settings, subagent_timeout_s=240))
    assert open_s <= 30
    assert open_s + steps_s + firecrawl_interact.CLOSE_TIMEOUT_S <= 240
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

    # passo avulso: até o orçamento total dos passos (100 − 25 − 15 = 60s)
    assert calls == [("scrape", 25.0, 1), ("interact", 60.0, 1)]


class _FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def _fake_interact_run(monkeypatch, durations):
    """post_json falso que gasta cada duração no relógio falso e estoura
    (ProviderError) quando ela passa do timeout recebido — como o httpx."""
    clock = _FakeClock()
    started = clock.now
    pending = list(durations)
    calls, closed = [], []

    async def fake_post_json(url, *, json_body, headers=None, timeout_s=20.0, retries=3):
        kind = url.rsplit("/", 1)[-1]
        calls.append((kind, timeout_s))
        took = pending.pop(0)
        if took > timeout_s:
            clock.now += timeout_s
            raise ProviderError(f"{kind}: ReadTimeout após {timeout_s:.0f}s")
        clock.now += took
        return {"data": {"metadata": {"scrapeId": "abc"}, "output": f"saida {len(calls)}"}}

    async def fake_close(settings, scrape_id):
        closed.append(scrape_id)

    monkeypatch.setattr(firecrawl_interact, "post_json", fake_post_json)
    monkeypatch.setattr(firecrawl_scripts, "_clock", clock, raising=False)
    monkeypatch.setattr(firecrawl_scripts, "close_session", fake_close)
    return clock, started, calls, closed


def _run(cfg):
    return asyncio.run(
        firecrawl_scripts._run_steps(cfg, "https://example.test", ["p1", "p2", "p3"])
    )


def test_interact_run_that_fits_the_cap_succeeds(settings, monkeypatch):
    # 10s abrir + 15 + 20 + 100s = 145s < 240s: o passo lento usa a sobra
    clock, started, calls, closed = _fake_interact_run(monkeypatch, [10, 15, 20, 100])
    cfg = replace(settings, firecrawl_api_key="k", subagent_timeout_s=240)

    assert _run(cfg) == "saida 4"
    # orçamento dos passos 240 − 30 − 15 = 195s; cada passo ≤ 150s e ≤ o que resta
    assert calls == [
        ("scrape", 30.0), ("interact", 150.0), ("interact", 150.0), ("interact", 150.0),
    ]
    assert clock.now - started == 145
    assert closed == ["abc"]


def test_interact_run_over_budget_raises_before_the_cap(settings, monkeypatch):
    # o passo 2 recebe só o que resta (95s) e estoura; o passo 3 nem começa
    clock, started, calls, closed = _fake_interact_run(monkeypatch, [10, 100, 120, 1])
    cfg = replace(settings, firecrawl_api_key="k", subagent_timeout_s=240)

    with pytest.raises(ProviderError, match="ReadTimeout após 95s"):
        _run(cfg)
    assert [t for _, t in calls] == [30.0, 150.0, 95.0]
    assert clock.now - started + firecrawl_interact.CLOSE_TIMEOUT_S <= 240
    assert closed == ["abc"]


def test_interact_run_stops_when_step_budget_is_spent(settings, monkeypatch):
    # passos 1 e 2 gastam exatamente os 195s: o passo 3 falha SEM ser enviado
    clock, started, calls, closed = _fake_interact_run(monkeypatch, [10, 100, 95, 1])
    cfg = replace(settings, firecrawl_api_key="k", subagent_timeout_s=240)

    with pytest.raises(ProviderError, match="esgotado antes do passo 3/3"):
        _run(cfg)
    assert [t for _, t in calls] == [30.0, 150.0, 95.0]
    assert clock.now - started + firecrawl_interact.CLOSE_TIMEOUT_S <= 240
    assert closed == ["abc"]


def test_interact_run_without_cap_keeps_historic_timeouts(settings, monkeypatch):
    # sem teto (0): 40s para abrir e 150s por passo, sem prazo total
    clock, started, calls, closed = _fake_interact_run(monkeypatch, [10, 140, 140, 140])
    cfg = replace(settings, firecrawl_api_key="k", subagent_timeout_s=0)

    assert _run(cfg) == "saida 4"
    assert [t for _, t in calls] == [40.0, 150.0, 150.0, 150.0]
    assert closed == ["abc"]


def test_close_session_uses_close_timeout(settings, monkeypatch):
    import httpx

    seen = []

    class FakeClient:
        def __init__(self, *, timeout):
            seen.append(timeout)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def delete(self, url, headers=None):
            return None

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    asyncio.run(firecrawl_interact.close_session(replace(settings, firecrawl_api_key="k"), "abc"))
    assert seen == [firecrawl_interact.CLOSE_TIMEOUT_S]
