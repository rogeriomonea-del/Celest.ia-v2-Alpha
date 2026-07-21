import asyncio
from datetime import date

from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.config import Settings
from celestia_engine.models import Cabin, SearchRequest


def _settings(**overrides) -> Settings:
    settings = Settings(
        mock_mode=True,
        prefilter_top_k=2,
        max_subagents=3,
        history_enabled=False,
        mesh_csv="tests/does-not-exist.csv",
    )
    for key, value in overrides.items():
        setattr(settings, key, value)
    return settings


def _request(**overrides) -> SearchRequest:
    request = SearchRequest(
        origin="GRU",
        destination="MIA",
        depart=date(2026, 9, 10),
        cabin_target=Cabin.BUSINESS,
        flex_days=1,
        miles_balance=100_000,
        program="connectmiles",
    )
    for key, value in overrides.items():
        setattr(request, key, value)
    return request


def test_prefilter_shortlists_and_saves_scrapes():
    orchestrator = Orchestrator(_settings())
    report = asyncio.run(orchestrator.search(_request()))

    stats = report.stats
    # GRU-MIA: Copa via PTY + LATAM nonstop + GOL nonstop = 3 rotas x 3 datas
    assert stats.candidates_total == 9
    assert stats.candidates_scraped == 2  # prefilter_top_k
    assert stats.scrapes_saved_by_prefilter == 7
    # prefilter dedupes paid calls by (pair, date): 3 unique fetches + 2 scrapes
    assert stats.subagents_spawned == 5
    # o relatório traz UMA cotação por (par, data) — réplicas por rota são
    # deduplicadas e, como o par tinha CM+LA+G3, viram metasearch ("*")
    assert len(report.quotes) == 3
    assert all(q.route.carrier == "*" for q in report.quotes)
    assert any("deduplicadas" in line for line in report.agent_log)


def test_offers_and_options_are_produced_and_ranked():
    orchestrator = Orchestrator(_settings())
    report = asyncio.run(orchestrator.search(_request()))

    assert report.offers, "mock scraping must yield offers"
    # options ranked ascending by effective cost
    costs = [o.effective_total_brl for o in report.options]
    assert costs == sorted(costs)
    # all four strategy families present for at least one itinerary
    strategies = {o.strategy.value for o in report.options}
    assert "business_cash" in strategies
    assert "full_miles" in strategies
    assert "economy_miles_upgrade" in strategies
    assert "economy_cash_upgrade" in strategies


def test_no_prefilter_scrapes_everything():
    # mock_mode off and no API keys -> no prefilter sources -> scrape all
    settings = _settings(mock_mode=False)
    orchestrator = Orchestrator(settings)
    candidates = asyncio.run(orchestrator.plan_candidates(_request()))
    shortlist = orchestrator._shortlist(candidates, {}, report_stats := __import__(
        "celestia_engine.models", fromlist=["SearchStats"]
    ).SearchStats())
    scrapable = [c for c in candidates if c[0].carrier in {"CM", "LA", "G3", "AD"}]
    assert shortlist == scrapable
    assert report_stats.candidates_scraped == len(scrapable)


def test_audit_removes_duplicates_and_bad_prices():
    from celestia_engine.models import FlightOffer, Source

    orchestrator = Orchestrator(_settings())
    good = FlightOffer(
        carrier="CM",
        flight_numbers=("CM 100",),
        origin="GRU",
        destination="PTY",
        depart=date(2026, 9, 10),
        cabin=Cabin.ECONOMY,
        price_cash_brl=1500.0,
        source=Source.COPA,
    )
    duplicate = FlightOffer(**{**good.__dict__})
    bad = FlightOffer(
        carrier="LA",
        flight_numbers=("LA 200",),
        origin="GRU",
        destination="PTY",
        depart=date(2026, 9, 10),
        cabin=Cabin.ECONOMY,
        price_cash_brl=-10.0,
        source=Source.LATAM,
    )
    clean = orchestrator._audit([good, duplicate, bad])
    assert clean == [good]


def test_agent_log_records_subagent_lifecycle():
    orchestrator = Orchestrator(_settings())
    report = asyncio.run(orchestrator.search(_request(flex_days=0)))
    log_text = "\n".join(report.agent_log)
    assert "subagente iniciado" in log_text
    assert "subagente concluído" in log_text
    assert "pré-filtro" in log_text


def _cm_offer(**kw):
    from celestia_engine.models import FlightOffer, Source

    base = dict(
        carrier="CM", flight_numbers=("CM 702",), origin="GRU",
        destination="PTY", depart=date(2026, 9, 10), cabin=Cabin.ECONOMY,
        source=Source.COPA, raw={},
    )
    base.update(kw)
    return FlightOffer(**base)


def test_audit_merges_cash_and_miles_versions_of_same_flight():
    # linha em dinheiro + linha em milhas do MESMO voo: mescla, não descarta —
    # sem isto a estratégia FULL_MILES sumia do itinerário
    orchestrator = Orchestrator(_settings())
    cash = _cm_offer(price_cash_brl=1500.0, raw={"via": "scrape"})
    miles = _cm_offer(price_miles=60000, miles_program="connectmiles",
                      taxes_brl=180.0, raw={"via": "interact"})
    clean = orchestrator._audit([cash, miles])
    assert len(clean) == 1
    merged = clean[0]
    assert merged.price_cash_brl == 1500.0
    assert merged.price_miles == 60000 and merged.miles_program == "connectmiles"
    assert merged.raw["via"] == "scrape"          # a primeira vence no raw


def test_audit_keeps_distinct_metasearch_flights_with_pair_placeholder():
    # fallback "GRU-PTY" do gf2 (sem "?"): voos distintos não podem colapsar
    orchestrator = Orchestrator(_settings())
    a = _cm_offer(flight_numbers=("GRU-PTY",), price_cash_brl=1800.0,
                  raw={"departure_time": "08:10", "indicative": True})
    b = _cm_offer(flight_numbers=("GRU-PTY",), price_cash_brl=2100.0,
                  raw={"departure_time": "22:40", "indicative": True})
    clean = orchestrator._audit([a, b])
    assert len(clean) == 2


def test_sequential_searches_do_not_accumulate_stats_or_log():
    orchestrator = Orchestrator(_settings())
    first = asyncio.run(orchestrator.search(_request(flex_days=0)))
    second = asyncio.run(orchestrator.search(_request(flex_days=0)))
    assert second.stats.subagents_spawned == first.stats.subagents_spawned
    # o log do segundo relatório não repete as linhas do primeiro
    assert len(second.agent_log) <= len(first.agent_log) + 5
