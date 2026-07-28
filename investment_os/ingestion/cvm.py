"""Ingestão bronze dos dados abertos da CVM (DFP, ITR, cadastro, IPE)."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from .base import fetch_bronze

BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA"
# ano corrente: datasets mudam diariamente (novos protocolos/reapresentações)
_CURRENT_YEAR = date.today().year


def _dated(name: str, year: int) -> str:
    """Nome de bronze: datado para anos mutáveis (corrente e anterior)."""
    if year >= _CURRENT_YEAR - 1:
        return f"{name}.{date.today().isoformat()}"
    return name


def ingest_cadastro(cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/CAD/DADOS/cad_cia_aberta.csv",
        f"cad_cia_aberta.{date.today().isoformat()}.csv",
        cache_file=cache_file,
    )


def ingest_dfp(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/DFP/DADOS/dfp_cia_aberta_{year}.zip",
        _dated(f"dfp_cia_aberta_{year}", year) + ".zip",
        cache_file=cache_file,
    )


def ingest_itr(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/ITR/DADOS/itr_cia_aberta_{year}.zip",
        _dated(f"itr_cia_aberta_{year}", year) + ".zip",
        cache_file=cache_file,
    )


def ingest_fca(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/FCA/DADOS/fca_cia_aberta_{year}.zip",
        _dated(f"fca_cia_aberta_{year}", year) + ".zip",
        cache_file=cache_file,
    )


def ingest_ipe(year: int, cache_file: Path | None = None) -> Path:
    return fetch_bronze(
        "cvm_dados_abertos",
        f"{BASE}/DOC/IPE/DADOS/ipe_cia_aberta_{year}.zip",
        _dated(f"ipe_cia_aberta_{year}", year) + ".zip",
        cache_file=cache_file,
    )
