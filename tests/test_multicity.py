"""Multidestinos: contrato, validação, orquestração e combinações."""

import asyncio
from datetime import date

from fastapi.testclient import TestClient

from celestia_engine.agents import multicity as mc
from celestia_engine.agents.multicity import (
    MultiCityOrchestrator,
    combine_itineraries,
    LegOutcome,
)
from celestia_engine.api import create_app
from celestia_engine.config import Settings
from celestia_engine.models import (
    Cabin,
    FlightOffer,
    PurchaseOption,
    SearchReport,
    SearchRequest,
    SearchStats,
    Source,
    Strategy,
    STRATEGY_LABELS,
)


def _settings(**overrides) -> Settings:
    settings = Settings(
        mock_mode=True, prefilter_top_k=2, history_enabled=False,
        mesh_csv="tests/does-not-exist.csv",
    )
    for key, value in overrides.items():
        setattr(settings, key, value)
    return settings


def _client(**overrides) -> TestClient:
    return TestClient(create_app(_settings(**overrides)))


def _legs(n: int = 2):
    routes = [
        ("GRU", "LIS", "2026-09-15"),
        ("LIS", "CDG", "2026-09-20"),
        ("CDG", "FCO", "2026-09-23"),
        ("FCO", "MAD", "2026-09-25"),
        ("MAD", "MIA", "2026-09-27"),
        ("MIA", "GRU", "2026-09-29"),
    ]
    return [
        {"origin": o, "destination": d, "depart": dt, "flexibility": None}
        for o, d, dt in routes[:n]
    ]


BODY = {
    "legs": _legs(2),
    "cabin": "business",
    "passengers": 1,
    "milesBalance": 100000,
    "program": "connectmiles",
}


# ------------------------------------------------------------------ contrato
def test_status_announces_multicity_capabilities():
    status = _client().get("/api/status").json()
    caps = status["capabilities"]
    assert caps["multiCity"] is True
    assert caps["maxMultiCityLegs"] == 6
    assert caps["multiCityPricingScope"] == "independentLegs"
    # campos legados preservados
    assert "mockMode" in status and "strategies" in status


def test_legacy_search_response_shape_unchanged():
    data = _client().post("/api/search", json={
        "origin": "GRU", "destination": "MIA", "depart": "2026-09-10",
        "cabin": "business", "milesBalance": 100000, "program": "connectmiles",
    }).json()
    assert set(data) == {
        "mode", "flights", "lastResort", "options", "quotes", "stats", "agentLog",
    }


def test_multicity_2_legs_ok_camelcase_and_order():
    response = _client().post("/api/search/multi-city", json=BODY)
    assert response.status_code == 200
    data = response.json()
    assert data["searchType"] == "multiCity"
    assert data["pricingScope"] == "independentLegs"
    assert data["partial"] is False
    assert [leg["legIndex"] for leg in data["legs"]] == [0, 1]
    assert data["legs"][0]["origin"] == "GRU" and data["legs"][0]["destination"] == "LIS"
    assert data["legs"][1]["origin"] == "LIS" and data["legs"][1]["destination"] == "CDG"
    # cada trecho tem o shape do EngineSearchResponse + metadados
    for leg in data["legs"]:
        for key in ("mode", "flights", "options", "quotes", "stats", "agentLog",
                    "lastResort", "status", "requestedDepart", "error"):
            assert key in leg
    stats = data["stats"]
    assert stats["legsTotal"] == 2 and stats["legsSucceeded"] == 2
    assert stats["legsFailed"] == 0
    assert "candidatesTotal" in stats and "durationSeconds" in stats


def test_multicity_3_and_6_legs_ok():
    for n in (3, 6):
        data = _client().post(
            "/api/search/multi-city", json={**BODY, "legs": _legs(n)}
        ).json()
        assert len(data["legs"]) == n
        assert [leg["legIndex"] for leg in data["legs"]] == list(range(n))


def test_open_jaw_accepted():
    legs = [
        {"origin": "GRU", "destination": "CDG", "depart": "2026-09-15", "flexibility": None},
        {"origin": "FCO", "destination": "GRU", "depart": "2026-09-25", "flexibility": None},
    ]
    response = _client().post("/api/search/multi-city", json={**BODY, "legs": legs})
    assert response.status_code == 200


def _error_code(response) -> str:
    return response.json()["detail"]["code"]


def test_leg_count_bounds_rejected():
    one = _client().post("/api/search/multi-city", json={**BODY, "legs": _legs(1)})
    assert one.status_code == 422 and _error_code(one) == "INVALID_LEG_COUNT"
    seven = {**BODY, "legs": _legs(6) + [
        {"origin": "GRU", "destination": "SCL", "depart": "2026-10-02", "flexibility": None}
    ]}
    resp = _client().post("/api/search/multi-city", json=seven)
    assert resp.status_code == 422 and _error_code(resp) == "INVALID_LEG_COUNT"


def test_invalid_iata_same_airport_dates_and_duplicates():
    bad_iata = {**BODY, "legs": [
        {"origin": "SÃO", "destination": "LIS", "depart": "2026-09-15", "flexibility": None},
        {"origin": "LIS", "destination": "GRU", "depart": "2026-09-20", "flexibility": None},
    ]}
    resp = _client().post("/api/search/multi-city", json=bad_iata)
    assert resp.status_code == 422 and _error_code(resp) == "INVALID_IATA"

    same = {**BODY, "legs": [
        {"origin": "GRU", "destination": "GRU", "depart": "2026-09-15", "flexibility": None},
        {"origin": "GRU", "destination": "LIS", "depart": "2026-09-20", "flexibility": None},
    ]}
    resp = _client().post("/api/search/multi-city", json=same)
    assert resp.status_code == 422 and _error_code(resp) == "SAME_AIRPORT"

    out_of_order = {**BODY, "legs": [
        {"origin": "GRU", "destination": "LIS", "depart": "2026-09-20", "flexibility": None},
        {"origin": "LIS", "destination": "CDG", "depart": "2026-09-15", "flexibility": None},
    ]}
    resp = _client().post("/api/search/multi-city", json=out_of_order)
    assert resp.status_code == 422 and _error_code(resp) == "DATES_OUT_OF_ORDER"

    dup = {**BODY, "legs": [
        {"origin": "GRU", "destination": "LIS", "depart": "2026-09-15", "flexibility": None},
        {"origin": "GRU", "destination": "LIS", "depart": "2026-09-15", "flexibility": None},
    ]}
    resp = _client().post("/api/search/multi-city", json=dup)
    # datas iguais caem primeiro na regra de ordem estritamente crescente
    assert resp.status_code == 422
    assert _error_code(resp) in ("DUPLICATE_LEG", "DATES_OUT_OF_ORDER")


def test_incomplete_custom_flex_rejected_and_unknown_fields_forbidden():
    incomplete = {**BODY, "legs": [
        {"origin": "GRU", "destination": "LIS", "depart": "2026-09-15",
         "flexibility": {"enabled": True, "preset": "custom",
                         "windowStart": "2026-09-10", "windowEnd": None}},
        {"origin": "LIS", "destination": "CDG", "depart": "2026-09-20", "flexibility": None},
    ]}
    resp = _client().post("/api/search/multi-city", json=incomplete)
    assert resp.status_code == 422 and _error_code(resp) == "DATES_OUT_OF_ORDER"

    unknown = {**BODY, "returnDate": "2026-09-29"}
    resp = _client().post("/api/search/multi-city", json=unknown)
    assert resp.status_code == 422  # extra=forbid: returnDate não existe aqui


def test_roundtrip_via_two_legs_searches_both_directions():
    legs = [
        {"origin": "GRU", "destination": "LIS", "depart": "2026-09-15", "flexibility": None},
        {"origin": "LIS", "destination": "GRU", "depart": "2026-09-29", "flexibility": None},
    ]
    data = _client().post("/api/search/multi-city", json={**BODY, "legs": legs}).json()
    outbound, inbound = data["legs"]
    assert outbound["flights"], "ida deve ter voos"
    assert inbound["flights"], "volta deve ter voos"
    assert all(f["origin"] == "GRU" and f["destination"] == "LIS" for f in outbound["flights"])
    assert all(f["origin"] == "LIS" and f["destination"] == "GRU" for f in inbound["flights"])
    # nenhum vazamento entre trechos: ids disjuntos
    assert not ({f["id"] for f in outbound["flights"]} & {f["id"] for f in inbound["flights"]})


def test_mock_multicity_is_deterministic():
    first = _client().post("/api/search/multi-city", json=BODY).json()
    second = _client().post("/api/search/multi-city", json=BODY).json()
    ids_first = [i["id"] for i in first["itineraries"]]
    ids_second = [i["id"] for i in second["itineraries"]]
    assert ids_first == ids_second and ids_first, "itinerários determinísticos"
    assert [f["id"] for f in first["legs"][0]["flights"]] == [
        f["id"] for f in second["legs"][0]["flights"]
    ]


def test_itineraries_bounded_sorted_and_selections_resolve_to_flights():
    data = _client().post("/api/search/multi-city", json=BODY).json()
    itineraries = data["itineraries"]
    assert 0 < len(itineraries) <= 20
    totals = [i["effectiveTotalBrl"] for i in itineraries]
    assert totals == sorted(totals)
    assert [i["rank"] for i in itineraries] == list(range(1, len(itineraries) + 1))
    flight_ids_by_leg = [
        {f["id"] for f in leg["flights"]} for leg in data["legs"]
    ]
    for itinerary in itineraries:
        assert itinerary["priceBasis"] == "perPassenger"
        assert len(itinerary["selections"]) == len(data["legs"])
        for selection in itinerary["selections"]:
            # associação explícita seleção→voo do trecho correspondente
            assert selection["flightId"] in flight_ids_by_leg[selection["legIndex"]]
            assert selection["bookingUrl"].startswith(("http://", "https://"))
        assert any("reservados separadamente" in n for n in itinerary["notes"])


# ------------------------------------------------- orquestração (unidade/async)
def _request(origin="GRU", destination="LIS", day=15) -> SearchRequest:
    return SearchRequest(
        origin=origin, destination=destination, depart=date(2026, 9, day),
        cabin_target=Cabin.BUSINESS, miles_balance=100_000,
        program="connectmiles",
    )


def _run(coro):
    return asyncio.run(coro)


def test_shared_semaphore_and_scrape_budget(monkeypatch):
    seen: list[tuple[object, int]] = []

    async def fake_search(self, request):
        seen.append((self.ctx._semaphore, self.ctx.settings.scrape_hard_cap))
        return SearchReport(request=request, quotes=[], offers=[], options=[],
                            stats=SearchStats(), agent_log=[])

    monkeypatch.setattr(mc.Orchestrator, "search", fake_search)
    settings = _settings(multicity_max_scrapes=24)
    result = _run(MultiCityOrchestrator(settings).search(
        [_request(), _request("LIS", "CDG", 20), _request("CDG", "GRU", 25)]
    ))
    assert len(seen) == 3
    semaphores = {id(sem) for sem, _ in seen}
    assert len(semaphores) == 1, "todos os trechos compartilham UM semáforo"
    assert all(cap == 8 for _, cap in seen), "orçamento 24//3 = 8 por trecho"
    assert all(o.status == "empty" for o in result.legs)


def test_partial_failure_keeps_other_legs(monkeypatch):
    real_search = mc.Orchestrator.search

    async def flaky_search(self, request):
        if request.destination == "CDG":
            raise RuntimeError("upstream caiu")
        return await real_search(self, request)

    monkeypatch.setattr(mc.Orchestrator, "search", flaky_search)
    client = _client()
    data = client.post("/api/search/multi-city", json={**BODY, "legs": _legs(3)})
    assert data.status_code == 200
    payload = data.json()
    assert payload["partial"] is True
    ok_leg, failed_leg, third = payload["legs"]
    assert ok_leg["status"] in ("ok", "empty") and ok_leg["flights"]
    assert failed_leg["status"] == "failed"
    assert failed_leg["error"]["code"] == "LEG_SEARCH_FAILED"
    assert failed_leg["error"]["retriable"] is True
    assert failed_leg["lastResort"]["bookingUrl"].startswith(
        "https://www.google.com/travel/flights"
    )
    assert third["flights"], "erro num trecho não apaga os demais"
    assert payload["stats"]["legsFailed"] == 1


def test_total_failure_returns_502_with_per_leg_diagnostics(monkeypatch):
    async def broken_search(self, request):
        raise RuntimeError("todas as fontes fora")

    monkeypatch.setattr(mc.Orchestrator, "search", broken_search)
    response = _client().post("/api/search/multi-city", json=BODY)
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["code"] == "LEG_SEARCH_FAILED"
    assert len(detail["legs"]) == 2
    for leg in detail["legs"]:
        assert leg["error"]["code"] == "LEG_SEARCH_FAILED"
        assert leg["lastResort"]["bookingUrl"].startswith("https://")


def test_leg_timeout_and_global_timeout(monkeypatch):
    async def slow_search(self, request):
        await asyncio.sleep(0.3)
        return SearchReport(request=request, quotes=[], offers=[], options=[],
                            stats=SearchStats(), agent_log=[])

    monkeypatch.setattr(mc.Orchestrator, "search", slow_search)

    # timeout POR TRECHO
    settings = _settings(api_search_timeout_s=0.05)
    result = _run(MultiCityOrchestrator(settings).search([_request(), _request("LIS", "CDG", 20)]))
    assert all(o.status == "timeout" and o.error_code == "LEG_TIMEOUT" for o in result.legs)

    # timeout GLOBAL da jornada
    settings = _settings(api_search_timeout_s=300, multicity_search_timeout_s=0.05)
    result = _run(MultiCityOrchestrator(settings).search([_request(), _request("LIS", "CDG", 20)]))
    assert all(o.status == "timeout" for o in result.legs)
    assert any(o.error_code == "MULTICITY_TIMEOUT" for o in result.legs)

    # HTTP: todos expirados → 504
    client = _client(api_search_timeout_s=0.05)
    monkeypatch.setattr(mc.Orchestrator, "search", slow_search)
    response = client.post("/api/search/multi-city", json=BODY)
    assert response.status_code == 504


# --------------------------------------------------- combinações (beam search)
def _offer(origin, destination, *, cash=None, miles=None, cabin=Cabin.BUSINESS,
           number="XX 100", duration=600, indicative=False):
    raw = {"duration_min": duration}
    if indicative:
        raw["indicative"] = True
    return FlightOffer(
        carrier="XX", flight_numbers=(number,), origin=origin,
        destination=destination, depart=date(2026, 9, 15), cabin=cabin,
        price_cash_brl=cash, price_miles=miles, taxes_brl=100.0,
        miles_program="connectmiles" if miles else None,
        source=Source.MOCK, raw=raw,
    )


def _option(offer, *, strategy=Strategy.BUSINESS_CASH, cash=0.0, miles=0, effective=0.0):
    return PurchaseOption(
        strategy=strategy, label=STRATEGY_LABELS[strategy],
        cabin_final=offer.cabin, cash_brl=cash, miles=miles,
        milheiro_brl=30.0 if miles else None, effective_total_brl=effective,
        breakeven_milheiro_brl=None, offer_key=offer.itinerary_key(), notes=[],
    )


def _outcome(index, offers, options, origin="GRU", destination="LIS"):
    request = _request(origin, destination)
    report = SearchReport(request=request, quotes=[], offers=offers,
                          options=options, stats=SearchStats(), agent_log=[])
    return LegOutcome(index=index, request=request, status="ok", report=report)


def test_combination_sums_and_miles_shortfall_counted_once():
    a = _offer("GRU", "LIS", cash=5000.0, number="XX 100")
    b = _offer("LIS", "GRU", cash=4000.0, miles=120_000, number="XX 200")
    outcome_a = _outcome(0, [a], [_option(a, cash=5000.0, effective=5000.0)])
    outcome_b = _outcome(1, [b], [
        _option(b, strategy=Strategy.FULL_MILES, cash=100.0, miles=120_000,
                effective=3700.0),
    ], origin="LIS", destination="GRU")
    itineraries = combine_itineraries(
        [outcome_a, outcome_b], top_choices_per_leg=5, max_itineraries=20,
        miles_balance=100_000,
    )
    assert len(itineraries) == 1
    top = itineraries[0]
    assert top.cash_brl == 5100.0            # 5000 + 100
    assert top.miles == 120_000
    assert top.effective_total_brl == 8700.0  # 5000 + 3700
    # o saldo NÃO é reutilizado por trecho: déficit calculado UMA vez no total
    assert top.miles_shortfall == 20_000


def test_beam_search_bounded_deterministic_and_synthetic_indicative():
    offers_a = [
        _offer("GRU", "LIS", cash=1000.0 + i * 10, number=f"XX {100+i}")
        for i in range(8)
    ]
    options_a = [
        _option(o, cash=o.price_cash_brl, effective=o.price_cash_brl)
        for o in offers_a
    ]
    # trecho B: SEM opções — só tarifas indicativas com preço
    offers_b = [
        _offer("LIS", "CDG", cash=2000.0 + i * 25, number=f"YY {50+i}", indicative=True)
        for i in range(4)
    ]
    outcome_a = _outcome(0, offers_a, options_a)
    outcome_b = _outcome(1, offers_b, [], origin="LIS", destination="CDG")

    first = combine_itineraries([outcome_a, outcome_b], top_choices_per_leg=3,
                                max_itineraries=5, miles_balance=0)
    second = combine_itineraries([outcome_a, outcome_b], top_choices_per_leg=3,
                                 max_itineraries=5, miles_balance=0)
    assert [i.id for i in first] == [i.id for i in second]
    assert len(first) <= 5
    # 3 escolhas por trecho no máximo (não o produto cartesiano de 8×4)
    assert len({c.offer_key for i in first for c in i.selections if c.leg_index == 0}) <= 3
    top = first[0]
    synthetic = next(c for c in top.selections if c.leg_index == 1)
    assert synthetic.strategy == "indicative_cash" and synthetic.option_key is None
    assert synthetic.miles == 0, "escolha sintética não inventa milhas"
    assert any("indicativa" in n for n in top.notes)


def test_missing_leg_choices_means_no_itineraries():
    a = _offer("GRU", "LIS", cash=5000.0)
    outcome_a = _outcome(0, [a], [_option(a, cash=5000.0, effective=5000.0)])
    outcome_fail = LegOutcome(index=1, request=_request("LIS", "CDG", 20),
                              status="failed", report=None,
                              error_code="LEG_SEARCH_FAILED")
    assert combine_itineraries([outcome_a, outcome_fail], top_choices_per_leg=5,
                               max_itineraries=20, miles_balance=0) == []


def test_insecure_booking_url_rejected_by_cleaner():
    from celestia_engine.providers.firecrawl_interact import _clean_url

    assert _clean_url("javascript:alert(1)") is None
    assert _clean_url("data:text/html;base64,xxx") is None
    assert _clean_url("https://www.copaair.com/x") == "https://www.copaair.com/x"
