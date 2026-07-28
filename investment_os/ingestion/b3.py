"""Ingestão bronze das cotações históricas oficiais da B3 (COTAHIST)."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from .base import fetch_bronze

BASE = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist"


def ingest_year(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "b3_cotahist",
        f"{BASE}/COTAHIST_A{year}.ZIP",
        # ano corrente cresce a cada pregão E o ano anterior ainda muda no
        # início do ano seguinte (arquivo consolidado): bronze datado para
        # ambos, garantindo um download completo pós-virada que vence as
        # variantes parciais na resolução por recência (cli._bronze).
        (f"COTAHIST_A{year}.{date.today().isoformat()}.ZIP"
         if year >= date.today().year - 1 else f"COTAHIST_A{year}.ZIP"),
        cache_file=cache_file,
    )
