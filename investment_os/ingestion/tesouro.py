"""Ingestão bronze do CSV oficial de preços e taxas do Tesouro Direto."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from .base import fetch_bronze

TESOURO_CSV_URL = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv"
)


def ingest(cache_file: Path | None = None) -> Path:
    # fonte mutável (novas linhas diárias): bronze versionado por data de
    # ingestão — imutabilidade preservada, refresh possível
    return fetch_bronze(
        "tesouro_transparente",
        TESOURO_CSV_URL,
        f"precotaxatesourodireto.{date.today().isoformat()}.csv",
        cache_file=cache_file,
    )
