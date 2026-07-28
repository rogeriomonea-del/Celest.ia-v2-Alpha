"""Execução do screener sobre o universo gold.

Universo = companhias ativas com DFP consolidada em silver. Critérios de
mercado exigem listagem (FCA) + preço B3; sem eles, os critérios ficam
NOT_EVALUATED — nunca aprovação nem reprovação silenciosa.
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd

from .. import config
from ..engine.metrics import Metric
from ..silver import listings as sv_listings
from ..silver import quotes as sv_quotes
from ..silver import statements as sv_statements
from .build_gold import build_company_row
from .presets import QUALITY_DEEP_VALUE_V1, evaluate_quality_deep_value

_CLASS_ORDER = {"ON": "3", "PN": "4"}


def _load_cadastro(bronze_csv: Path) -> pd.DataFrame:
    cad = pd.read_csv(bronze_csv, sep=";", encoding="latin-1", dtype=str)
    cad["cd_cvm"] = cad["CD_CVM"].astype(str).str.lstrip("0")
    return cad.drop_duplicates(subset=["cd_cvm"], keep="last").set_index("cd_cvm")


def _price_info(prices: pd.DataFrame, tickers: list[str]) -> tuple[dict, date | None, float | None]:
    """Preço de fechamento mais recente por classe + liquidez média 63d."""
    sub = prices[prices["ticker"].isin(tickers)]
    if sub.empty:
        return {}, None, None
    last_date = sub["trade_date"].max()
    by_class: dict[str, float | None] = {}
    for tkr in tickers:
        t = sub[sub["ticker"] == tkr]
        if t.empty:
            continue
        cls = "ON" if tkr.endswith("3") else "PN" if tkr.endswith("4") else "UNIT"
        row = t[t["trade_date"] == t["trade_date"].max()]
        price = float(row["close"].iloc[0])
        # classe pode ter mais de um ticker (raro); mantém o mais líquido
        if cls not in by_class or float(t["volume_fin"].mean()) > 0:
            by_class[cls] = price
    main = sub.groupby("ticker")["volume_fin"].sum().idxmax()
    t = sub[sub["ticker"] == main].sort_values("trade_date").tail(63)
    liquidity = float(t["volume_fin"].mean()) if not t.empty else None
    return by_class, last_date, liquidity


def build_universe(cadastro_csv: Path) -> list[dict]:
    facts = sv_statements.load_facts()
    capital = sv_statements.load_capital().set_index("cnpj")
    listings = sv_listings.load()
    prices = sv_quotes.load()
    cad = _load_cadastro(cadastro_csv)

    rows: list[dict] = []
    for cd_cvm, f in facts.groupby("cd_cvm"):
        cnpj = f["cnpj"].iloc[0]
        lst = listings[listings["cnpj"] == cnpj]
        tickers = sorted(lst["ticker"].unique().tolist())
        prices_by_class, price_date, liquidity = _price_info(prices, tickers)
        shares = capital.loc[cnpj] if cnpj in capital.index else None
        cad_row = cad.loc[cd_cvm] if cd_cvm in cad.index else None
        if cad_row is not None and str(cad_row.get("SIT", "")).strip() != "ATIVO":
            continue
        rows.append(
            build_company_row(
                cd_cvm, f, cad_row, prices_by_class, price_date, shares, liquidity, tickers
            )
        )
    return rows


def run_screener(rows: list[dict]) -> dict:
    # Percentil 35 setorial do P/L (>=5 pares com P/L OK)
    pe_by_sector: dict[str, list[float]] = {}
    for r in rows:
        if r["pe"].ok and r["setor"]:
            pe_by_sector.setdefault(r["setor"], []).append(r["pe"].value)

    results = []
    for r in rows:
        peers = pe_by_sector.get(r["setor"], [])
        n_peers = len(peers)
        p35 = (
            float(pd.Series(peers).quantile(0.35)) if n_peers >= QUALITY_DEEP_VALUE_V1["params"]["min_sector_peers"] else None
        )
        criteria = evaluate_quality_deep_value(r, p35, n_peers)
        n_fail = sum(1 for c in criteria if c.outcome == "FAIL")
        n_ne = sum(1 for c in criteria if c.outcome == "NOT_EVALUATED")
        # DADOS_INSUFICIENTES: critérios demais sem avaliação — nunca rotular
        # como "quase aprovada" uma empresa que simplesmente não tem dados.
        status = (
            "APROVADA" if n_fail == 0 and n_ne == 0
            else "DADOS_INSUFICIENTES" if n_ne >= 4
            else "QUASE_APROVADA" if n_fail <= 1
            else "REPROVADA"
        )
        results.append({"row": r, "criteria": criteria, "status": status, "n_fail": n_fail, "n_not_evaluated": n_ne})

    return {
        "preset": {k: v for k, v in QUALITY_DEEP_VALUE_V1.items() if k != "params"} | {"params": QUALITY_DEEP_VALUE_V1["params"]},
        "results": results,
        "run_date": date.today().isoformat(),
    }


def _metric_cell(m: Metric, scale: float = 1.0, digits: int = 2) -> str:
    if m.value is None:
        return m.status.value.lower()
    return f"{m.value * scale:.{digits}f}"


def export(screen: dict) -> dict[str, Path]:
    """Exporta resultados para CSV + JSON gold (fonte/data-base por linha)."""
    config.GOLD_DIR.mkdir(parents=True, exist_ok=True)
    recs = []
    for res in screen["results"]:
        r = res["row"]
        failed = [c.criterion for c in res["criteria"] if c.outcome == "FAIL"]
        not_ev = [c.criterion for c in res["criteria"] if c.outcome == "NOT_EVALUATED"]
        recs.append(
            {
                "ticker": r["tickers"], "empresa": r["empresa"], "cd_cvm": r["cd_cvm"],
                "setor": r["setor"],
                "preco_data": r["preco_data"],
                "valor_mercado_brl": r["market_cap"].value if r["market_cap"].ok else None,
                "liquidez_63d_brl": r["liquidez_media_63d_brl"],
                "pl": _metric_cell(r["pe"]),
                "pvpa": _metric_cell(r["pvpa"]),
                "roe_ltm": _metric_cell(r["roe_ltm"], 100),
                "roe_med5": _metric_cell(r["roe_med5"], 100),
                "div_liq_ebitda": _metric_cell(r["nd_ebitda"]),
                "cagr_receita": _metric_cell(r["rev_cagr5"], 100),
                "cagr_lucro": _metric_cell(r["ni_cagr5"], 100),
                "conversao_caixa": _metric_cell(r["cash_conv"]),
                "status": res["status"],
                "criterios_reprovados": "; ".join(failed),
                "criterios_nao_avaliados": "; ".join(not_ev),
                "ultima_demonstracao": r["ultima_demonstracao"],
                "dt_receb_ultimo_doc": r["dt_receb_ultimo_doc"],
                "link_doc": r["link_doc"],
                "fontes": "CVM DFP/ITR (dados.cvm.gov.br); B3 COTAHIST; preços não ajustados",
            }
        )
    df = pd.DataFrame(recs).sort_values(["status", "empresa"])
    csv_path = config.GOLD_DIR / "screener_quality_deep_value.csv"
    df.to_csv(csv_path, index=False)

    json_path = config.GOLD_DIR / "screener_quality_deep_value.json"
    payload = {
        "preset": screen["preset"],
        "run_date": screen["run_date"],
        "pendencias_globais_do_preset": QUALITY_DEEP_VALUE_V1["not_evaluated_mvp"],
        "empresas": [
            {
                **{k: v for k, v in rec.items()},
                "criterios": [
                    {"criterio": c.criterion, "resultado": c.outcome, "detalhe": c.detail}
                    for c in res["criteria"]
                ],
            }
            for rec, res in zip(recs, screen["results"])
        ],
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return {"csv": csv_path, "json": json_path}
