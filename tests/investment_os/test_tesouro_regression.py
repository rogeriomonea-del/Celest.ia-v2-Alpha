"""Teste de regressão congelado — Tesouro IPCA+ 15/08/2050.

Fixture: snapshot REAL do CSV oficial do Tesouro Transparente
(precotaxatesourodireto.csv), título "Tesouro IPCA+" com vencimento 15/08/2050,
coluna "Taxa Compra Manha", pregões até 24/07/2026 (inclusive).

Este resultado valida apenas o SNAPSHOT: o produto recalcula sempre com o
dataset atualizado (o limite 7,11% nunca é fixado no produto).
"""
import csv
from datetime import date
from pathlib import Path

from investment_os.engine.windows import analyze

FIXTURE = Path(__file__).parent / "fixtures" / "td_ipca2050_ate_2026-07-24.csv"
THRESHOLD = 7.11


def load_series():
    with open(FIXTURE, encoding="utf-8") as f:
        return [
            (date.fromisoformat(row["data_base"]), float(row["taxa_compra_manha"]))
            for row in csv.DictReader(f)
        ]


def test_snapshot_congelado_24_07_2026():
    series = load_series()
    a = analyze(series, THRESHOLD)
    assert a.last_date == date(2026, 7, 24)
    assert a.total_sessions == 368
    assert a.sessions_at_or_above == 105
    assert len(a.windows) == 14
    assert round(a.fraction * 100, 2) == 28.53
    assert a.max_rate == 7.52


def test_snapshot_nao_mistura_vencimentos():
    # A fixture contém apenas um instrumento: datas únicas.
    series = load_series()
    dates = [d for d, _ in series]
    assert len(dates) == len(set(dates))
