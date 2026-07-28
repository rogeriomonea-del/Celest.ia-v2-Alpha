"""Análise determinística da carteira (snapshot) contra dados oficiais e IPS.

Separação explícita de natureza dos dados:
- FATO IMPORTADO: quantidade, custo declarado, data-base da carteira;
- DADO OFICIAL: preço B3 (com data do pregão), setor CVM;
- CÁLCULO DETERMINÍSTICO: valores, pesos, aderência, concentração;
- DADO AUSENTE: preço/resolução indisponível NUNCA vira zero — a posição sai
  da base de pesos e derruba a cobertura e a confiança.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date

from . import db as pdb


def load_prices(tickers: list[str]) -> dict[str, dict]:
    """Último fechamento B3 por ticker (silver). Preços NÃO ajustados."""
    from .. import config
    import pandas as pd

    path = config.SILVER_DIR / "market_prices.parquet"
    if not path.exists():
        return {}
    df = pd.read_parquet(path)
    df = df[df["ticker"].isin(tickers)]
    out: dict[str, dict] = {}
    for tkr, sub in df.groupby("ticker"):
        last = sub.sort_values("trade_date").iloc[-1]
        out[str(tkr)] = {"close": float(last["close"]), "trade_date": str(last["trade_date"])}
    return out


def load_sectors() -> dict[str, str]:
    """cnpj -> setor (cadastro CVM)."""
    from .importer import load_reference

    _, by_cnpj = load_reference()
    return {cnpj: (info.get("setor") or "desconhecido") for cnpj, info in by_cnpj.items()}


def _staleness_days(iso_date: str | None, today: date) -> int | None:
    if not iso_date:
        return None
    try:
        return (today - date.fromisoformat(iso_date[:10])).days
    except ValueError:
        return None


def analyze_snapshot(conn: sqlite3.Connection, snapshot_id: int,
                     policy_content: dict | None = None, *, today: date | None = None) -> dict:
    today = today or date.today()
    snap = conn.execute(
        "SELECT * FROM portfolio_snapshot WHERE id=?", (snapshot_id,)
    ).fetchone()
    if snap is None:
        raise ValueError("snapshot não encontrado")
    positions = [dict(r) for r in conn.execute(
        "SELECT * FROM position WHERE snapshot_id=?", (snapshot_id,)
    )]
    prices = load_prices([p["ticker"] for p in positions if p["ticker"]])
    sectors = load_sectors()

    valued: list[dict] = []
    unvalued: list[dict] = []
    for p in positions:
        price = prices.get(p["ticker"])
        entry = {
            "ticker": p["ticker"], "asset_class": p["asset_class"],
            "cnpj": p["cnpj"], "classe": p["classe"], "currency": p["currency"],
            "quantity": p["quantity"],                       # FATO IMPORTADO
            "avg_cost": p["avg_cost"],                       # FATO IMPORTADO (None = desconhecido)
            "cost_status": p["cost_status"],
            "setor": sectors.get(p["cnpj"] or "", "desconhecido"),
        }
        if price is None:
            entry["market_value"] = None
            entry["price_status"] = "indisponivel"
            entry["natureza"] = "DADO AUSENTE: sem série de preços oficial ingerida para o ticker"
            unvalued.append(entry)
        else:
            entry["price"] = price["close"]                  # DADO OFICIAL (B3, não ajustado)
            entry["price_date"] = price["trade_date"]
            entry["price_staleness_days"] = _staleness_days(price["trade_date"], today)
            entry["market_value"] = p["quantity"] * price["close"]  # CÁLCULO
            entry["price_status"] = "ok"
            valued.append(entry)

    total = sum(e["market_value"] for e in valued)
    coverage = len(valued) / len(positions) if positions else 0.0
    for e in valued:
        e["weight_pct"] = (e["market_value"] / total * 100) if total > 0 else None

    def _group(key_fn) -> dict[str, float]:
        out: dict[str, float] = {}
        for e in valued:
            k = key_fn(e) or "desconhecido"
            out[k] = out.get(k, 0.0) + (e["weight_pct"] or 0.0)
        return {k: round(v, 2) for k, v in sorted(out.items(), key=lambda kv: -kv[1])}

    weights = {
        "por_ativo": _group(lambda e: e["ticker"]),
        "por_emissor": _group(lambda e: e["cnpj"] or e["ticker"]),
        "por_setor": _group(lambda e: e["setor"]),
        "por_classe": _group(lambda e: e["asset_class"]),
        "por_moeda": _group(lambda e: e["currency"]),
        "por_pais": _group(lambda e: "BR" if e["currency"] == "BRL" else "ex-BR"),
    }
    top_weight = max(weights["por_ativo"].values(), default=0.0)
    hhi = round(sum((w / 100) ** 2 for w in weights["por_ativo"].values()), 4)

    violations: list[dict] = []
    if policy_content:
        bands = policy_content.get("faixas_por_classe", {})
        banda_pp = float(policy_content.get("bandas_rebalanceamento_pp", 5))
        class_weights = weights["por_classe"]
        for cls, band in bands.items():
            w = class_weights.get(cls, 0.0)
            if w > band["max_pct"] + banda_pp:
                violations.append({"tipo": "class_band", "chave": cls, "peso_pct": w,
                                   "faixa": band, "severidade": "critica"})
            elif w > band["max_pct"] or w < band["min_pct"]:
                violations.append({"tipo": "class_band", "chave": cls, "peso_pct": w,
                                   "faixa": band, "severidade": "nao_critica"})
        # classe proibida com QUALQUER peso é violação crítica, tenha ou não banda
        for cls in policy_content.get("classes_proibidas", []):
            w = class_weights.get(cls, 0.0)
            if w > 0:
                violations.append({"tipo": "classe_proibida", "chave": cls, "peso_pct": w,
                                   "severidade": "critica"})
        lim = policy_content.get("limites", {})
        for ticker, w in weights["por_ativo"].items():
            if lim.get("por_ativo_pct") and w > lim["por_ativo_pct"]:
                sev = "critica" if w > lim["por_ativo_pct"] + banda_pp else "nao_critica"
                violations.append({"tipo": "asset_limit", "chave": ticker, "peso_pct": w,
                                   "limite_pct": lim["por_ativo_pct"], "severidade": sev})
        for emissor, w in weights["por_emissor"].items():
            if lim.get("por_emissor_pct") and w > lim["por_emissor_pct"] and emissor != "desconhecido":
                sev = "critica" if w > lim["por_emissor_pct"] + banda_pp else "nao_critica"
                violations.append({"tipo": "issuer_limit", "chave": emissor, "peso_pct": w,
                                   "limite_pct": lim["por_emissor_pct"], "severidade": sev})
        for setor, w in weights["por_setor"].items():
            if lim.get("por_setor_pct") and w > lim["por_setor_pct"] and setor != "desconhecido":
                violations.append({"tipo": "sector_limit", "chave": setor, "peso_pct": w,
                                   "limite_pct": lim["por_setor_pct"], "severidade": "nao_critica"})
        ex_brl = sum(w for moeda, w in weights["por_moeda"].items() if moeda != "BRL")
        if lim.get("por_moeda_pct_ex_brl") is not None and ex_brl > lim["por_moeda_pct_ex_brl"]:
            violations.append({"tipo": "currency_limit", "chave": "ex_brl", "peso_pct": ex_brl,
                               "limite_pct": lim["por_moeda_pct_ex_brl"], "severidade": "nao_critica"})

    stale_prices = [e["ticker"] for e in valued if (e.get("price_staleness_days") or 0) > 7]
    # linhas excluídas na confirmação parcial reduzem a cobertura REAL da
    # carteira — nunca fingir 100% sobre um snapshot parcial
    excluded_rows = 0
    if snap["import_id"] is not None:
        excluded_rows = conn.execute(
            "SELECT COUNT(*) AS n FROM portfolio_import_row WHERE import_id=?"
            " AND status NOT IN ('ok', 'duplicate')",
            (snap["import_id"],),
        ).fetchone()["n"]
    data_quality = {
        "posicoes_total": len(positions),
        "posicoes_precificadas": len(valued),
        "cobertura_pct": round(coverage * 100, 1),
        "linhas_excluidas_na_importacao": excluded_rows,
        "sem_preco": [e["ticker"] for e in unvalued],
        "custo_desconhecido": [p["ticker"] for p in positions if p["avg_cost"] is None],
        "precos_stale_7d": stale_prices,
        "contribuicao_de_risco": "indisponivel (exige séries de retornos por ativo — fase futura)",
    }
    confidence = ("ALTA" if coverage >= 0.95 and not stale_prices
                  else "MEDIA" if coverage >= 0.8 else "BAIXA")
    if excluded_rows > 0 and confidence == "ALTA":
        confidence = "MEDIA"

    result = {
        "snapshot_id": snapshot_id, "data_base_carteira": snap["data_base"],
        "data_analise": today.isoformat(),
        "patrimonio_precificado_brl": round(total, 2),
        "nota_patrimonio": "soma apenas das posições com preço oficial; NÃO é o patrimônio total se cobertura < 100%",
        "pesos": weights, "posicoes": valued + unvalued,
        "concentracao": {"maior_posicao_pct": round(top_weight, 2), "hhi": hhi},
        "violacoes": violations,
        "qualidade_dados": data_quality,
        "confianca": confidence,
        "fontes": "quantidades/custos: importação confirmada; preços: B3 COTAHIST (não ajustados); setor: cadastro CVM",
    }
    pdb.audit(conn, "snapshot_analyzed", snapshot_id=snapshot_id,
              coverage_pct=data_quality["cobertura_pct"], violations=len(violations))
    return result
