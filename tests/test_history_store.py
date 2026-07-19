import asyncio
import csv
from datetime import date

from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.config import Settings
from celestia_engine.models import SearchRequest
from celestia_engine.storage import HISTORY_FIELDS, SearchHistoryStore, record_report


def _run_mock_search(tmp_path, history_enabled=True):
    settings = Settings(
        mock_mode=True,
        prefilter_top_k=2,
        history_enabled=history_enabled,
        history_dir=str(tmp_path),
        mesh_csv=str(tmp_path / "no-mesh.csv"),
    )
    orchestrator = Orchestrator(settings)
    request = SearchRequest(origin="GRU", destination="MIA", depart=date(2026, 9, 10))
    report = asyncio.run(orchestrator.search(request))
    return settings, report


def _read_rows(path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def test_history_rows_match_report_and_schema(tmp_path):
    settings, report = _run_mock_search(tmp_path)
    path = tmp_path / "searches.csv"
    assert path.is_file()

    rows = _read_rows(path)
    expected = len(report.quotes) + len(report.offers) + len(report.options)
    assert len(rows) == expected

    # fixed schema, exact order
    with path.open(encoding="utf-8") as handle:
        header = handle.readline().strip().split(",")
    assert header == HISTORY_FIELDS

    kinds = {row["record_type"] for row in rows}
    assert kinds == {"quote", "offer", "option"}
    # every row shares the search context
    assert {row["origin"] for row in rows} == {"GRU"}
    assert {row["search_id"] for row in rows} != {""}
    # option rows carry strategy + effective cost; quote rows don't
    option_rows = [r for r in rows if r["record_type"] == "option"]
    assert all(r["strategy"] and r["effective_total_brl"] for r in option_rows)
    quote_rows = [r for r in rows if r["record_type"] == "quote"]
    assert all(r["strategy"] == "" for r in quote_rows)


def test_history_appends_without_duplicate_header(tmp_path):
    settings, report = _run_mock_search(tmp_path)
    first = len(_read_rows(tmp_path / "searches.csv"))
    store = SearchHistoryStore(tmp_path)
    store.record(report)
    rows = _read_rows(tmp_path / "searches.csv")
    assert len(rows) == first * 2
    # search_id differs between runs
    assert len({row["search_id"] for row in rows}) == 2


def test_history_disabled_writes_nothing(tmp_path):
    settings, report = _run_mock_search(tmp_path, history_enabled=False)
    assert not (tmp_path / "searches.csv").exists()
    assert record_report(settings, report) is None
