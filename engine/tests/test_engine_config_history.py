"""Milheiro inválido no env e histórico só quando houve linhas gravadas."""

import asyncio
import logging
from dataclasses import replace
from datetime import date
from pathlib import Path

from celestia_engine.agents.orchestrator import Orchestrator
from celestia_engine.config import DEFAULT_MILHEIRO_BRL, load_settings
from celestia_engine.models import SearchReport, SearchRequest, SearchStats
from celestia_engine.storage import record_report

DEPART = date(2030, 3, 10)


def test_non_positive_milheiro_env_falls_back_with_warning(monkeypatch, caplog):
    monkeypatch.setenv("MILHEIRO_LATAMPASS", "0")
    monkeypatch.setenv("MILHEIRO_SMILES", "-5")
    monkeypatch.setenv("MILHEIRO_AZUL", "25.5")
    with caplog.at_level(logging.WARNING, logger="celestia_engine.config"):
        settings = load_settings()
    assert settings.milheiro_for("latampass") == DEFAULT_MILHEIRO_BRL["latampass"]
    assert settings.milheiro_for("smiles") == DEFAULT_MILHEIRO_BRL["smiles"]
    assert settings.milheiro_for("azul") == 25.5
    warned = " ".join(r.getMessage() for r in caplog.records)
    assert "MILHEIRO_LATAMPASS" in warned and "MILHEIRO_SMILES" in warned


def test_record_report_returns_none_when_nothing_written(settings):
    cfg = replace(settings, history_enabled=True)
    empty = SearchReport(
        request=SearchRequest(origin="GRU", destination="LIS", depart=DEPART),
        quotes=[], offers=[], options=[], stats=SearchStats(), agent_log=[],
    )
    assert record_report(cfg, empty) is None
    assert not (Path(cfg.history_dir) / "searches.csv").exists()


def test_orchestrator_does_not_claim_history_for_empty_search(settings):
    # sem chaves e sem estratégias: nada é cotado nem raspado (e nada sai na rede)
    cfg = replace(settings, history_enabled=True, scrape_strategies="")
    request = SearchRequest(origin="GRU", destination="LIS", depart=DEPART)
    report = asyncio.run(Orchestrator(cfg).search(request))
    assert report.offers == [] and report.options == []
    assert not any("histórico gravado" in line for line in report.agent_log)
