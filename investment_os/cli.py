"""CLI do pipeline: ingestão -> silver -> gold -> relatórios.

Uso:
    python -m investment_os.cli ingest        # baixa fontes oficiais (bronze)
    python -m investment_os.cli build         # silver + gold + screener
    python -m investment_os.cli report        # relatórios (screener, Ativo 360, Tesouro)
    python -m investment_os.cli all

IIOS_CACHE_DIR: diretório opcional com arquivos já baixados NESTA sessão das
mesmas URLs oficiais (evita re-download); hash e auditoria são gerados do mesmo
jeito.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from . import config
from .ingestion import b3 as ing_b3
from .ingestion import cvm as ing_cvm
from .ingestion import tesouro as ing_tesouro

DFP_YEARS = (2021, 2022, 2023, 2024, 2025)
ITR_YEARS = (2025, 2026)
FCA_YEARS = (2025, 2026)
B3_YEARS = (2025, 2026)

# Ativos da demonstração (ADR-0003) — selecionados por liquidez, NÃO recomendação.
DEMO_TICKERS = {"VALE3", "PETR3", "PETR4", "WEGE3", "ITUB3", "ITUB4", "HGLG11"}


def _cache(name: str) -> Path | None:
    cache_dir = os.environ.get("IIOS_CACHE_DIR")
    if not cache_dir:
        return None
    p = Path(cache_dir) / name
    return p if p.exists() else None


def cmd_ingest() -> dict:
    config.ensure_dirs()
    paths: dict = {}
    paths["tesouro"] = ing_tesouro.ingest(cache_file=_cache("precotaxatesourodireto.csv"))
    paths["cadastro"] = ing_cvm.ingest_cadastro(cache_file=_cache("cad_cia_aberta.csv"))
    paths["dfp"] = {y: ing_cvm.ingest_dfp(y, cache_file=_cache(f"dfp_cia_aberta_{y}.zip")) for y in DFP_YEARS}
    paths["itr"] = {y: ing_cvm.ingest_itr(y, cache_file=_cache(f"itr_cia_aberta_{y}.zip")) for y in ITR_YEARS}
    paths["fca"] = {y: ing_cvm.ingest_fca(y, cache_file=_cache(f"fca_cia_aberta_{y}.zip")) for y in FCA_YEARS}
    paths["b3"] = {y: ing_b3.ingest_year(y, cache_file=_cache(f"COTAHIST_A{y}.ZIP")) for y in B3_YEARS}
    print("bronze ok:", {k: str(v) for k, v in paths.items() if not isinstance(v, dict)})
    return paths


def _bronze(name: str, source: str) -> Path:
    p = config.BRONZE_DIR / source / name
    if not p.exists():
        sys.exit(f"bronze ausente: {p} — rode 'ingest' antes")
    return p


def cmd_build(universe_tickers: set[str] | None = None) -> None:
    from .silver import listings as sv_listings
    from .silver import quotes as sv_quotes
    from .silver import statements as sv_statements
    from .silver import tesouro as sv_tesouro

    config.ensure_dirs()
    print("silver: tesouro...")
    sv_tesouro.build(_bronze("precotaxatesourodireto.csv", "tesouro_transparente"))

    print("silver: listagens (FCA)...")
    sv_listings.build({y: _bronze(f"fca_cia_aberta_{y}.zip", "cvm_dados_abertos") for y in FCA_YEARS})

    print("silver: demonstrações (DFP/ITR)...")
    dfp = {y: _bronze(f"dfp_cia_aberta_{y}.zip", "cvm_dados_abertos") for y in DFP_YEARS}
    itr = {y: _bronze(f"itr_cia_aberta_{y}.zip", "cvm_dados_abertos") for y in ITR_YEARS}
    sv_statements.build(dfp, itr)
    sv_statements.build_capital(dfp, itr)

    print("silver: cotações B3 (universo com listagem FCA)...")
    tickers = universe_tickers
    if tickers is None:
        tickers = set(sv_listings.load()["ticker"].unique()) | DEMO_TICKERS
    sv_quotes.build(
        [_bronze(f"COTAHIST_A{y}.ZIP", "b3_cotahist") for y in B3_YEARS], tickers
    )

    print("gold: universo + screener...")
    from .screener.run import build_universe, export, run_screener

    rows = build_universe(_bronze("cad_cia_aberta.csv", "cvm_dados_abertos"))
    screen = run_screener(rows)
    paths = export(screen)
    n = {s: sum(1 for r in screen["results"] if r["status"] == s) for s in ("APROVADA", "QUASE_APROVADA", "REPROVADA", "DADOS_INSUFICIENTES")}
    print(f"screener: {len(rows)} empresas | {n}")
    print("gold:", {k: str(v) for k, v in paths.items()})


def cmd_report() -> None:
    from .reports.asset360 import build_all as asset360_all
    from .reports.screener_report import build as screener_report
    from .reports.tesouro_report import build as tesouro_report

    config.ensure_dirs()
    out = []
    out.append(tesouro_report())
    out.append(screener_report())
    out.extend(asset360_all())
    for p in out:
        print("report:", p)


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("ingest", "all"):
        cmd_ingest()
    if cmd in ("build", "all"):
        cmd_build()
    if cmd in ("report", "all"):
        cmd_report()


if __name__ == "__main__":
    main()
