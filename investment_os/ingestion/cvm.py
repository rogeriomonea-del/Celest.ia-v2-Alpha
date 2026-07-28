"""Ingestão bronze dos dados abertos da CVM (DFP, ITR, cadastro, IPE)."""
from __future__ import annotations

from pathlib import Path

from .base import fetch_bronze

BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA"


def ingest_cadastro(cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/CAD/DADOS/cad_cia_aberta.csv",
        "cad_cia_aberta.csv",
        cache_file=cache_file,
    )


def ingest_dfp(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/DFP/DADOS/dfp_cia_aberta_{year}.zip",
        f"dfp_cia_aberta_{year}.zip",
        cache_file=cache_file,
    )


def ingest_itr(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/ITR/DADOS/itr_cia_aberta_{year}.zip",
        f"itr_cia_aberta_{year}.zip",
        cache_file=cache_file,
    )


def ingest_fca(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/FCA/DADOS/fca_cia_aberta_{year}.zip",
        f"fca_cia_aberta_{year}.zip",
        cache_file=cache_file,
    )


def ingest_ipe(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/IPE/DADOS/ipe_cia_aberta_{year}.zip",
        f"ipe_cia_aberta_{year}.zip",
        cache_file=cache_file,
    )
