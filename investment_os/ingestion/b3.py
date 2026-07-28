"""Ingestão bronze das cotações históricas oficiais da B3 (COTAHIST)."""
from __future__ import annotations

from pathlib import Path

from .base import fetch_bronze

BASE = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist"


def ingest_year(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "b3_cotahist",
        f"{BASE}/COTAHIST_A{year}.ZIP",
        f"COTAHIST_A{year}.ZIP",
        cache_file=cache_file,
    )
