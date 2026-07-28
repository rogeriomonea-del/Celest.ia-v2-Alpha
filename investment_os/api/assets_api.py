"""API v1 do registro de ativos B3 (universo completo) + intradiário indicativo.

O registro vem do silver `asset_registry.parquet` (COTAHIST + FCA, classificação
heurística documentada). O intradiário usa brapi.dev como fonte SECUNDÁRIA
rotulada (ADR-0006) — nunca em cálculos, nunca persistido.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, HTTPException

from .. import config
from ..marketdata import brapi

router = APIRouter(prefix="/v1", tags=["ativos"])

FONTE_REGISTRO = (
    "B3 COTAHIST (oficial, preços não ajustados, D-1) + CVM FCA; "
    "classificação de tipo HEURÍSTICA (ver campo classificacao_confianca)"
)
TIPOS_VALIDOS = ("acao_br", "fii", "bdr", "etf_ou_fundo", "unit")

_cache: dict = {"mtime": None, "df": None}


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def _registry() -> pd.DataFrame:
    path = config.SILVER_DIR / "asset_registry.parquet"
    if not path.exists():
        raise _error(404, "registry_missing",
                     "registro de ativos ausente — rode 'python -m investment_os.cli build'")
    mtime = path.stat().st_mtime
    if _cache["mtime"] != mtime:
        _cache["df"] = pd.read_parquet(path)
        _cache["mtime"] = mtime
    return _cache["df"]


def _row_out(r: pd.Series) -> dict:
    close = r["ultimo_fechamento"]
    return {
        "ticker": r["ticker"],
        "tipo": r["tipo"],
        "classificacao_confianca": r["classificacao_confianca"],
        "cnpj_emissor": r["cnpj_emissor"] if isinstance(r["cnpj_emissor"], str) else None,
        "ultimo_pregao": str(r["ultimo_pregao"]),
        "ultimo_fechamento": float(close) if close is not None and not (isinstance(close, float) and math.isnan(close)) else None,
        "especificacao": r["especificacao"],
        "ajustado_por_proventos": False,
    }


@router.get("/ativos")
def listar_ativos(tipo: str | None = None, busca: str | None = None,
                  limite: int = 100, pagina: int = 1) -> dict:
    df = _registry()
    if tipo is not None:
        if tipo not in TIPOS_VALIDOS:
            raise _error(422, "tipo_invalido", f"tipo '{tipo}' inválido; use {TIPOS_VALIDOS}")
        df = df[df["tipo"] == tipo]
    if busca:
        # regex=False: busca literal — entrada do usuário nunca vira regex
        df = df[df["ticker"].str.contains(busca.strip().upper(), na=False, regex=False)]
    limite = max(1, min(int(limite), 500))
    pagina = max(1, int(pagina))
    total = len(df)
    page = df.iloc[(pagina - 1) * limite : pagina * limite]
    reg_date = str(_registry()["ultimo_pregao"].max())
    return {
        "total": total,
        "pagina": pagina,
        "limite": limite,
        "data_base": reg_date,
        "fonte": FONTE_REGISTRO,
        "tipos": {t: int((_registry()["tipo"] == t).sum()) for t in TIPOS_VALIDOS},
        "ativos": [_row_out(r) for _, r in page.iterrows()],
    }


@router.get("/ativos/{ticker}")
def obter_ativo(ticker: str) -> dict:
    df = _registry()
    hit = df[df["ticker"] == ticker.strip().upper()]
    if hit.empty:
        raise _error(404, "ativo_not_found",
                     f"ticker {ticker.upper()} não consta no registro B3 (mercado a vista)")
    out = _row_out(hit.iloc[0])
    out["fonte"] = FONTE_REGISTRO
    return out


@router.get("/ativos/{ticker}/intradiario")
def intradiario(ticker: str) -> dict:
    """Cotação intradiária INDICATIVA (agregador autorizado; nunca em cálculos)."""
    t = ticker.strip().upper()
    df = _registry()
    hit = df[df["ticker"] == t]
    if hit.empty:
        raise _error(404, "ativo_not_found",
                     f"ticker {t} não consta no registro B3 (mercado a vista)")
    oficial = _row_out(hit.iloc[0])
    try:
        quote = brapi.get_quote(t)
    except brapi.BrapiUnavailableError:
        # mensagem estática: nenhum detalhe interno de rede/proxy vai ao cliente
        raise _error(503, "intradiario_indisponivel",
                     "cotação intradiária indisponível no agregador — use o "
                     f"fechamento oficial D-1 ({oficial['ultimo_pregao']})")
    return {
        "ticker": t,
        "intradiario": quote,
        "oficial_d1": {
            "fechamento": oficial["ultimo_fechamento"],
            "pregao": oficial["ultimo_pregao"],
            "fonte": "b3_cotahist (oficial, não ajustado)",
        },
        "consultado_em": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
    }
