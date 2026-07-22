import asyncio
from datetime import date

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.flex_scout import FlexDateScoutAgent
from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.config import Settings
from celestia_engine.models import Flexibility, SearchRequest
from celestia_engine.providers import firecrawl_interact
from celestia_engine.providers.firecrawl_interact import parse_calendar_output


def test_flex_presets_resolve_symmetric_window():
    depart = date(2026, 9, 20)
    assert Flexibility(enabled=True, preset="1w").resolve_window(depart) == (
        date(2026, 9, 13),
        date(2026, 9, 27),
    )
    assert Flexibility(enabled=True, preset="1m").resolve_window(depart) == (
        date(2026, 8, 21),
        date(2026, 10, 20),
    )


def test_flex_custom_window_orders_dates():
    flex = Flexibility(
        enabled=True, preset="custom",
        window_start=date(2026, 12, 1), window_end=date(2026, 1, 10),  # invertidas
    )
    start, end = flex.resolve_window(date(2026, 6, 1))
    assert start < end  # normaliza a ordem


def test_parse_calendar_json_with_usd():
    text = (
        '{"calendar":[{"date":"2026-09-20","price":300,"currency":"USD"},'
        '{"date":"2026-09-21","price":1500,"currency":"BRL"},'
        '{"date":"bad","price":100},{"date":"2026-09-22","price":"n/a"}]}'
    )
    prices = parse_calendar_output(text, usd_brl_rate=5.0)
    assert len(prices) == 2
    assert prices[0].price_brl == 1500.0  # 300 USD * 5
    assert prices[1].price_brl == 1500.0


def _flex_request(**kw):
    base = dict(
        origin="GRU", destination="MCO", depart=date(2026, 9, 20),
        flexibility=Flexibility(enabled=True, preset="2w"), flex_max_dates=3,
    )
    base.update(kw)
    return SearchRequest(**base)


def test_scout_picks_cheapest_dates_in_mock():
    agent = FlexDateScoutAgent(AgentContext(settings=Settings(mock_mode=True)))
    dates = asyncio.run(agent.cheapest_dates(_flex_request()))
    assert len(dates) == 3
    # todas dentro da janela ±14 dias
    for d in dates:
        assert date(2026, 9, 6) <= d <= date(2026, 10, 4)


def test_scout_without_flexibility_returns_single_date():
    agent = FlexDateScoutAgent(AgentContext(settings=Settings(mock_mode=True)))
    req = SearchRequest(origin="GRU", destination="MCO", depart=date(2026, 9, 20))
    assert asyncio.run(agent.cheapest_dates(req)) == [date(2026, 9, 20)]


def test_scout_degrades_when_calendar_errors(monkeypatch):
    async def boom(settings, **kw):
        from celestia_engine.providers.base import ProviderError
        raise ProviderError("sem calendário")

    monkeypatch.setattr(firecrawl_interact, "scan_calendar", boom)
    settings = Settings(firecrawl_api_key="fc")  # not mock -> real path -> error -> fallback
    agent = FlexDateScoutAgent(AgentContext(settings=settings))
    dates = asyncio.run(agent.cheapest_dates(_flex_request()))
    assert dates and len(dates) <= 3  # janela amostrada, não vazia


def test_orchestrator_flex_search_uses_cheap_dates():
    settings = Settings(mock_mode=True, prefilter_top_k=2, history_enabled=False,
                        mesh_csv="nope.csv")
    orchestrator = Orchestrator(settings)
    report = asyncio.run(orchestrator.search(_flex_request()))
    # candidatos = rotas × datas escolhidas (3), não a janela inteira (29 dias)
    unique_dates = {c[1] for c in
                    asyncio.run(orchestrator.plan_candidates(_flex_request()))}
    assert len(unique_dates) == 3
    assert report.offers  # busca completa com as datas baratas


def test_scout_degrades_when_all_dates_outside_window(monkeypatch):
    # o calendário devolve datas, mas TODAS fora da janela pedida: não pode
    # estourar IndexError — deve degradar para a janela simétrica.
    from celestia_engine.models import DatePrice, Source

    async def only_outside(settings, **kw):
        return [DatePrice(date=date(2026, 11, 1), price_brl=999.0, source=Source.GOOGLE_FLIGHTS)]

    monkeypatch.setattr(firecrawl_interact, "scan_calendar", only_outside)
    agent = FlexDateScoutAgent(AgentContext(settings=Settings(firecrawl_api_key="fc")))
    dates = asyncio.run(agent.cheapest_dates(_flex_request()))
    assert dates and len(dates) <= 3  # degradou sem lançar


def test_window_fallback_never_returns_past_dates():
    from datetime import timedelta

    from celestia_engine.agents.flex_scout import _window_fallback

    today = date.today()
    req = SearchRequest(
        origin="GRU", destination="MCO", depart=today + timedelta(days=10), flex_max_dates=5
    )
    dates = _window_fallback(req, today - timedelta(days=30), today + timedelta(days=30))
    assert dates, "fallback nunca é vazio"
    assert all(d >= today for d in dates)  # nenhuma data passada vai ao scraper
    assert req.depart in dates  # a ida pedida está entre as candidatas


def test_parse_calendar_accepts_br_date_format():
    text = '{"calendar":[{"date":"20/09/2026","price":1400,"currency":"BRL"}]}'
    prices = parse_calendar_output(text, usd_brl_rate=5.0)
    assert len(prices) == 1
    assert prices[0].date == date(2026, 9, 20)
    assert prices[0].price_brl == 1400.0
