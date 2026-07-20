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
        "copa_direct", "latam_direct", "google_flights_search", "google_flights_calendar",
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


def test_route_outside_cm_la_mesh_returns_indicative_quotes():
    # CGH-MCO não tem rota Copa/LATAM: scraping vazio, mas o pré-filtro cota —
    # a API devolve as cotações como cards indicativos em vez de 0 voos.
    response = _client().post("/api/search", json={**BODY, "origin": "CGH", "destination": "MCO"})
    assert response.status_code == 200
    data = response.json()
    assert data["flights"], "cotações do metasearch devem virar cards"
    assert all(f["indicative"] is True for f in data["flights"])
    assert all(f["flightNumbers"] == [] for f in data["flights"])
    assert all(f["priceBrl"] > 0 for f in data["flights"])
    # ofertas raspadas continuam NÃO indicativas
    scraped = _client().post("/api/search", json=BODY).json()
    assert scraped["flights"] and all(f["indicative"] is False for f in scraped["flights"])


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
