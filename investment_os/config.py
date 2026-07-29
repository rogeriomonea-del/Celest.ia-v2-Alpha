"""Configuração central do sistema.

O nome do produto é configurável (IIOS_SYSTEM_NAME) e não pode ser acoplado ao
código: use sempre config.SYSTEM_NAME em qualquer saída voltada ao usuário.
"""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SYSTEM_NAME = os.environ.get("IIOS_SYSTEM_NAME", "Investment Intelligence OS")
BASE_CURRENCY = os.environ.get("IIOS_BASE_CURRENCY", "BRL")

# Parâmetros iniciais EDITÁVEIS do investidor (docs/ASSUMPTIONS.md).
# Não substituem o questionário de suitability.
MONTHLY_CONTRIBUTION = float(os.environ.get("IIOS_MONTHLY_CONTRIBUTION", "100000"))
# Taxa de referência monitorada: Tesouro IPCA+ 2050 a IPCA + 7,11% a.a.
REFERENCE_RATE_PCT = float(os.environ.get("IIOS_REFERENCE_RATE_PCT", "7.11"))

DATA_DIR = Path(os.environ.get("IIOS_DATA_DIR", REPO_ROOT / "data"))
BRONZE_DIR = DATA_DIR / "bronze"
SILVER_DIR = DATA_DIR / "silver"
GOLD_DIR = DATA_DIR / "gold"
DOCUMENTS_DIR = DATA_DIR / "documents"
AUDIT_DIR = DATA_DIR / "audit"
REPORTS_DIR = DATA_DIR / "reports"

USER_AGENT = os.environ.get(
    "IIOS_USER_AGENT",
    "InvestmentIntelligenceOS/0.1 (pesquisa pessoal; contato via repositorio)",
)

# Rate limit por host (segundos entre requisições) e retries com backoff.
REQUEST_INTERVAL_S = float(os.environ.get("IIOS_REQUEST_INTERVAL_S", "1.0"))
RETRY_BACKOFF_S = (2, 4, 8, 16)


def ensure_dirs() -> None:
    for d in (BRONZE_DIR, SILVER_DIR, GOLD_DIR, DOCUMENTS_DIR, AUDIT_DIR, REPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
