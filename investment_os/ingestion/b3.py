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
        # arquivo anual do ano corrente cresce a cada pregão: bronze datado
        (f"COTAHIST_A{year}.{date.today().isoformat()}.ZIP"
         if year >= date.today().year else f"COTAHIST_A{year}.ZIP"),
        cache_file=cache_file,
    )
