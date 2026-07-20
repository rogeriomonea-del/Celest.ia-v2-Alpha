import asyncio
from datetime import date

from celestia_engine.agents.base import AgentContext
from celestia_engine.agents.mesh import (
    RouteMeshAgent,
    live_routes_between,
    load_live_routes,
    save_mesh_csv,
)
from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.config import Settings
from celestia_engine.models import Route, SearchRequest
from celestia_engine.providers import lyov


def test_plans_to_routes_maps_and_dedupes():
    plans = [
        {"company": "TAM", "departure": "SBGR", "arrival": "SBBR"},
        {"company": "TAM", "departure": "SBGR", "arrival": "SBBR"},  # dup
        {"company": "GLO", "departure": "SBSP", "arrival": "SBGL"},
        {"company": "AZU", "departure": "SBKP", "arrival": "KMCO"},
        {"company": "TAM", "departure": "SBGR", "arrival": "ZZZZ"},  # unknown icao
        {"company": "XXX", "departure": "SBGR", "arrival": "SBBR"},  # unknown airline
    ]
    routes = lyov.plans_to_routes(plans)
    assert Route("GRU", "BSB", "LA", direct=True) in routes
    assert Route("CGH", "GIG", "G3", direct=True) in routes
    assert Route("VCP", "MCO", "AD", direct=True) in routes
    assert len(routes) == 3


def test_mesh_csv_roundtrip(tmp_path):
    routes = [Route("GRU", "BSB", "LA"), Route("VCP", "MCO", "AD")]
    path = save_mesh_csv(routes, tmp_path / "mesh" / "routes_live.csv")
    settings = Settings(mesh_csv=str(path))
    loaded = load_live_routes(settings)
    assert sorted(r.slug() for r in loaded) == sorted(r.slug() for r in routes)
    assert live_routes_between(settings, "gru", "bsb")[0].carrier == "LA"
    assert live_routes_between(settings, "GRU", "MCO") == []


def test_missing_mesh_csv_is_empty(tmp_path):
    settings = Settings(mesh_csv=str(tmp_path / "nope.csv"))
    assert load_live_routes(settings) == []


def test_mesh_agent_mock_refresh_writes_csv(tmp_path):
    settings = Settings(mock_mode=True, mesh_csv=str(tmp_path / "routes_live.csv"))
    agent = RouteMeshAgent(AgentContext(settings=settings))
    routes = asyncio.run(agent.refresh())
    assert routes, "mock plans must yield routes"
    assert (tmp_path / "routes_live.csv").is_file()
    assert len(load_live_routes(settings)) == len(routes)


def test_corrupt_mesh_csv_never_breaks_search(tmp_path):
    # truncated row (missing columns) + binary garbage: search must survive
    mesh_path = tmp_path / "routes_live.csv"
    mesh_path.write_text("carrier,origin,destination,direct,via,updated_at\nLA,GIG\n\x00garbage")
    settings = Settings(mock_mode=True, mesh_csv=str(mesh_path), history_enabled=False)
    assert load_live_routes(settings) == []

    orchestrator = Orchestrator(settings)
    request = SearchRequest(origin="GRU", destination="MIA", depart=date(2026, 9, 10))
    report = asyncio.run(orchestrator.search(request))
    assert report.offers, "search must degrade to curated routes and still work"


def test_orchestrator_merges_live_mesh_routes(tmp_path):
    # GIG→LIS curated: LATAM only via GRU. Live mesh adds an LA nonstop.
    mesh_path = tmp_path / "routes_live.csv"
    save_mesh_csv([Route("GIG", "LIS", "LA", direct=True)], mesh_path)
    settings = Settings(mock_mode=True, mesh_csv=str(mesh_path), history_enabled=False)
    orchestrator = Orchestrator(settings)
    request = SearchRequest(origin="GIG", destination="LIS", depart=date(2026, 9, 10))

    candidates = asyncio.run(orchestrator.plan_candidates(request))
    slugs = {route.slug() for route, _ in candidates}
    assert "LA:GIG-GRU-LIS" in slugs   # curated via-hub route
    assert "LA:GIG--LIS" in slugs      # live mesh nonstop merged in
