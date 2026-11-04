import sys
from datetime import date
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from celestia_travel.config import Settings
from celestia_travel.miles.connectmiles import ConnectMilesClient
from celestia_travel.models import CabinClass, FlightQuery
from celestia_travel.orchestrator import Orchestrator
from celestia_travel.providers.mock_provider import MockProvider


def test_full_pipeline_produces_report():
    query = FlightQuery(
        origin="GRU",
        destination="MIA",
        depart_date=date(2026, 8, 11),  # terça
        flex_days=2,
        cabin=CabinClass.ECONOMY,
        passengers=2,
    )
    orchestrator = Orchestrator([MockProvider()], Settings(milheiro_reference=20.0))
    report = orchestrator.run_sync(query, balances=[ConnectMilesClient.mock()])

    assert report.offers_found > 0
    assert report.offers_valid > 0
    assert 1 <= len(report.evaluations) <= 5
    # Ranqueado por score decrescente.
    scores = [ev.score for ev in report.evaluations]
    assert scores == sorted(scores, reverse=True)
    assert report.narrative_source == "heuristica"
    assert report.query.route in report.narrative
    assert "demo" in report.providers_queried


def test_events_are_emitted_in_pipeline_order():
    events = []
    query = FlightQuery(origin="GRU", destination="GIG", depart_date=date(2026, 8, 12))
    orchestrator = Orchestrator(
        [MockProvider()], Settings(), listener=events.append
    )
    orchestrator.run_sync(query)

    agents_seen = [event.agent for event in events]
    for expected in ["planejador", "buscador", "auditor", "avaliador", "relator"]:
        assert expected in agents_seen
    assert agents_seen.index("planejador") < agents_seen.index("buscador")
    assert agents_seen.index("buscador") < agents_seen.index("relator")


def test_report_to_dict_is_json_serializable():
    import json

    query = FlightQuery(origin="GRU", destination="LIS", depart_date=date(2026, 9, 1))
    report = Orchestrator([MockProvider()], Settings()).run_sync(query)
    payload = json.dumps(report.to_dict(), ensure_ascii=False)
    assert query.route in payload
