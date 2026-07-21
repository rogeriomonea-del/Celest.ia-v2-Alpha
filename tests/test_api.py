from fastapi.testclient import TestClient

from celestia_engine.api import create_app
from celestia_engine.config import Settings


def _client() -> TestClient:
    settings = Settings(
        mock_mode=True, prefilter_top_k=2, history_enabled=False,
        mesh_csv="tests/does-not-exist.csv",
    )
    return TestClient(create_app(settings))


BODY = {
    "origin": "GRU",
    "destination": "MIA",
    "depart": "2026-09-10",
    "cabin": "business",
    "milesBalance": 100000,
    "program": "connectmiles",
}


def test_health_and_status():
    client = _client()
    assert client.get("/api/health").json() == {"ok": True}
    status = client.get("/api/status").json()
    assert status["mockMode"] is True
    assert "firecrawl_interact" in status["strategies"]


def test_scripts_endpoint_lists_playbooks():
    names = {s["name"] for s in _client().get("/api/scripts").json()["scripts"]}
    assert names == {
        "copa_direct", "latam_direct", "gol_direct", "azul_direct",
        "google_flights_search", "google_flights_calendar",
    }


def test_search_returns_flights_options_and_stats():
    response = _client().post("/api/search", json=BODY)
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "mock"
    assert data["flights"], "mock search must return flights"
    assert data["options"], "purchase strategies must be evaluated"
    assert data["stats"]["candidatesTotal"] > 0

    flight = data["flights"][0]
    for field in ("id", "carrier", "flightNumbers", "priceBrl", "departureTime",
                  "arrivalTime", "durationMin", "cabin", "stops"):
        assert field in flight, f"campo {field} ausente"
    # horários sintetizados em mock são marcados como estimativa
    assert flight["scheduleEstimated"] is True
    # GRU-MIA via PTY existe na malha Copa: alguma oferta deve ter escala PTY
    assert any(
        stop["airport"] == "PTY" for f in data["flights"] for stop in f["stops"]
    )
    # ordenadas por preço (auditoria do orquestrador)
    prices = [f["priceBrl"] for f in data["flights"] if f["priceBrl"] is not None]
    assert prices == sorted(prices)


def test_search_with_flexibility_uses_cheap_dates():
    body = {
        **BODY,
        "flexibility": {"enabled": True, "preset": "2w"},
        "flexMaxDates": 3,
    }
    response = _client().post("/api/search", json=body)
    assert response.status_code == 200
    data = response.json()
    assert data["flights"]
    log = " ".join(data["agentLog"])
    assert "flex-scout" in log and "mais baratas" in log


def test_search_validation_errors():
    client = _client()
    assert client.post("/api/search", json={**BODY, "origin": "SAO PAULO"}).status_code == 422
    assert client.post("/api/search", json={**BODY, "cabin": "primeira"}).status_code == 422
    assert client.post("/api/search", json={**BODY, "depart": "10/09/2026"}).status_code == 422


def test_never_empty_handed_last_resort_link(monkeypatch):
    # Pior caso absoluto: nenhuma fonte respondeu (sem ofertas E sem cotações).
    # O usuário ainda recebe o link da busca pronta no Google Flights.
    from celestia_engine import api as api_module
    from celestia_engine.models import SearchReport, SearchStats

    class EmptyOrchestrator:
        def __init__(self, settings):
            pass

        async def search(self, request):
            return SearchReport(request=request, quotes=[], offers=[],
                                options=[], stats=SearchStats(), agent_log=[])

    monkeypatch.setattr(api_module, "Orchestrator", EmptyOrchestrator)
    data = _client().post("/api/search", json=BODY).json()
    assert data["flights"] == []
    assert data["lastResort"]["bookingUrl"].startswith(
        "https://www.google.com/travel/flights"
    )
    assert "GRU" in data["lastResort"]["bookingUrl"]


def test_last_resort_absent_when_there_are_results():
    data = _client().post("/api/search", json=BODY).json()
    assert data["flights"] and data["lastResort"] is None


def test_every_flight_has_a_booking_url():
    data = _client().post("/api/search", json=BODY).json()
    for flight in data["flights"]:
        assert flight["bookingUrl"].startswith(("http://", "https://"))
    # ofertas raspadas CM/LA usam o deep-link da companhia
    assert any(
        "copaair.com" in f["bookingUrl"] or "latamairlines.com" in f["bookingUrl"]
        for f in data["flights"]
    )
    # indicativas (CGH-MCO, metasearch) também têm link válido — deep-link da
    # companhia quando o registro tem template, senão Google Flights
    indicative = _client().post(
        "/api/search", json={**BODY, "origin": "CGH", "destination": "MCO"}
    ).json()
    assert indicative["flights"]
    assert all(
        f["bookingUrl"].startswith(("http://", "https://"))
        for f in indicative["flights"]
    )


def test_route_outside_cm_la_mesh_returns_indicative_metasearch():
    # SSA-NRT não tem rota em NENHUMA malha raspável (CM/LA/G3/AD): nada
    # raspável, mas o metasearch rico devolve voos indicativos
    # multi-companhia (premium) — nunca 0 resultados.
    response = _client().post("/api/search", json={**BODY, "origin": "SSA", "destination": "NRT"})
    assert response.status_code == 200
    data = response.json()
    assert data["flights"], "voos do metasearch devem aparecer"
    assert all(f["indicative"] is True for f in data["flights"])
    assert all(f["priceBrl"] > 0 for f in data["flights"])
    carriers = {f["carrier"] for f in data["flights"]}
    assert len(carriers) >= 2, "metasearch premium traz várias companhias"


def test_scraped_and_metasearch_results_are_merged():
    # Rota NA malha (GRU-MIA): raspados (CM/LA, não-indicativos) + metasearch
    # (outras cias, indicativos) aparecem JUNTOS — mais opções por pesquisa.
    data = _client().post("/api/search", json=BODY).json()
    scraped = [f for f in data["flights"] if not f["indicative"]]
    meta = [f for f in data["flights"] if f["indicative"]]
    assert scraped, "ofertas raspadas presentes"
    assert meta, "voos do metasearch mesclados no resultado"
    assert {f["carrier"] for f in scraped} & {"CM", "LA"}
    assert {f["carrier"] for f in meta} - {"CM", "LA"}, "metasearch traz outras cias"
    # módulo de milhas visível em todo card com preço em dinheiro
    assert all(
        f["milesEquivalent"] > 0 for f in data["flights"] if f["priceBrl"] is not None
    )


def test_custom_flex_window_roundtrips():
    body = {
        **BODY,
        "flexibility": {
            "enabled": True, "preset": "custom",
            "windowStart": "2026-09-01", "windowEnd": "2026-09-25",
        },
    }
    response = _client().post("/api/search", json=body)
    assert response.status_code == 200
    assert response.json()["flights"]
