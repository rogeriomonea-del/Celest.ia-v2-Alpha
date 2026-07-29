"""API v1 da Fase 6: macro (regimes/séries), Tesouro completo e visão geral."""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException

from .. import config

router = APIRouter(prefix="/v1", tags=["fase6"])


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def _gold(name: str) -> dict:
    path = config.GOLD_DIR / name
    if not path.exists():
        raise _error(404, "gold_missing",
                     f"artefato {name} ausente — rode 'python -m investment_os.cli macro'")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/macro/regimes")
def macro_regimes() -> dict:
    return _gold("macro_regimes.json")


@router.get("/macro/series/{serie_id}")
def macro_serie(serie_id: str) -> dict:
    data = _gold("macro_regimes.json")
    series = data.get("series_recentes", {})
    if serie_id not in series:
        raise _error(404, "serie_not_found",
                     f"série '{serie_id}' indisponível; disponíveis: {sorted(series)}")
    return {"serie_id": serie_id, "pontos": series[serie_id], "fonte": "bcb_sgs"}


@router.get("/tesouro/titulos")
def tesouro_titulos() -> dict:
    p = _gold("tesouro_paineis.json")
    # lista resumida (sem cenários MTM, que são pesados) + curvas + radar
    titulos = [
        {k: v for k, v in t.items() if k != "cenarios_mtm"} for t in p["titulos"]
    ]
    return {**{k: v for k, v in p.items() if k != "titulos"}, "titulos": titulos}


@router.get("/tesouro/titulos/{tipo}/{vencimento}/cenarios")
def tesouro_cenarios(tipo: str, vencimento: str) -> dict:
    p = _gold("tesouro_paineis.json")
    for t in p["titulos"]:
        if t["tipo"] == tipo and t["vencimento"] == vencimento:
            if not t.get("modelado"):
                raise _error(409, "nao_modelado",
                             t.get("motivo_nao_modelado", "título não modelado no MVP"))
            return {
                "tipo": tipo, "vencimento": vencimento,
                "data_base": t["data_base"], "taxa_atual_pct": t["taxa_compra_pct"],
                "risco": {
                    "duration_macaulay_anos": t["duration_macaulay_anos"],
                    "modified_duration_anos": t["modified_duration_anos"],
                    "dv01_brl": t["dv01_brl"], "convexidade": t["convexidade"],
                },
                "cenarios_mtm": t["cenarios_mtm"],
                "fonte": p["fonte"],
            }
    raise _error(404, "titulo_not_found", f"título {tipo} {vencimento} não encontrado na data-base atual")


def _mtime(path: Path) -> str | None:
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")


@router.get("/overview")
def overview() -> dict:
    """Visão geral agregada para o painel: screener, carteira, Tesouro, macro,
    saúde dos dados. Cada bloco declara ausência em vez de inventar."""
    out: dict = {"gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds")}

    scr_path = config.GOLD_DIR / "screener_quality_deep_value.json"
    if scr_path.exists():
        scr = json.loads(scr_path.read_text(encoding="utf-8"))
        counts: dict[str, int] = {}
        for e in scr["empresas"]:
            counts[e["status"]] = counts.get(e["status"], 0) + 1
        aprovadas = [e for e in scr["empresas"] if e["status"] == "APROVADA"]
        out["screener"] = {
            "run_date": scr["run_date"], "universo": len(scr["empresas"]),
            "contagens": counts,
            "aprovadas": [{"ticker": e["ticker"], "empresa": e["empresa"], "pl": e["pl"],
                           "pvpa": e["pvpa"]} for e in aprovadas],
            "preset": f"{scr['preset']['preset_id']} v{scr['preset']['version']}",
        }
    else:
        out["screener"] = {"status": "indisponivel", "motivo": "rode 'cli build'"}

    tes_path = config.GOLD_DIR / "tesouro_paineis.json"
    if tes_path.exists():
        t = json.loads(tes_path.read_text(encoding="utf-8"))
        ref = next((x for x in t["titulos"]
                    if x["tipo"] == "Tesouro IPCA+" and x["vencimento"] == "2050-08-15"), None)
        out["tesouro"] = {
            "data_base": t["data_base"], "n_titulos": len(t["titulos"]),
            "janelas_no_radar": len(t["radar_janelas"]),
            "referencia_ipca2050": {
                "taxa_pct": ref["taxa_compra_pct"],
                "percentil_historico": ref.get("historico", {}).get("percentil_taxa_atual"),
                "threshold_monitorado_pct": config.REFERENCE_RATE_PCT,
                "threshold_origem": "premissa configurável do usuário (IIOS_REFERENCE_RATE_PCT) — não é meta oficial",
            } if ref else None,
        }
    else:
        out["tesouro"] = {"status": "indisponivel", "motivo": "rode 'cli macro'"}

    mac_path = config.GOLD_DIR / "macro_regimes.json"
    if mac_path.exists():
        m = json.loads(mac_path.read_text(encoding="utf-8"))
        out["macro"] = {
            "data_geracao": m["data_geracao"],
            "regimes": [{"dimensao": r["dimensao"], "estado": r["estado"],
                         "confianca": r["confianca"],
                         "eh_expectativa": "EXPECTATIVA" in (r.get("natureza") or "")}
                        for r in m["regimes"]],
        }
    else:
        out["macro"] = {"status": "indisponivel", "motivo": "rode 'cli macro'"}

    # carteira: presença de snapshot/IPS (sem valores — privacidade no overview)
    try:
        from ..portfolio import db as pdb

        conn = pdb.connect()
        snap = conn.execute(
            "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM portfolio_snapshot"
        ).fetchone()
        pol = conn.execute(
            "SELECT COUNT(*) AS n FROM policy_version WHERE status='confirmed'"
        ).fetchone()
        conn.close()
        out["carteira"] = {
            "snapshots": snap["n"], "ultimo_snapshot_em": snap["last"],
            "ips_confirmada": pol["n"] > 0,
        }
    except Exception:
        out["carteira"] = {"status": "indisponivel"}

    out["saude_dados"] = {
        "ultima_atualizacao_gold": {
            "screener": _mtime(scr_path), "tesouro": _mtime(tes_path), "macro": _mtime(mac_path),
        },
        "auditoria_ingestao": _mtime(config.AUDIT_DIR / "ingestion_runs.jsonl"),
        "nota": "valores ausentes aparecem como null/indisponível — nunca 0",
    }
    return out
