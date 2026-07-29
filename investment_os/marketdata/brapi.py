"""Cotação intradiária INDICATIVA via brapi.dev — fonte SECUNDÁRIA (agregador).

Regras (ADR-0006):
- brapi.dev é AGREGADOR: PROIBIDO como fonte primária e PROIBIDO em qualquer
  cálculo de indicador/retorno/screener. Uso exclusivo: exibição intradiária
  indicativa, autorizado explicitamente pelo usuário (dono da chave).
- A resposta NUNCA é persistida em bronze/silver/gold — passthrough de exibição.
- Token somente via env IIOS_BRAPI_TOKEN (nunca em código/commit/log).
- O payload externo é DADO: apenas campos conhecidos são extraídos e tipados;
  nada do JSON bruto é repassado (anti prompt-injection e anti-vazamento).
- O fechamento oficial B3 (D-1, não ajustado) permanece a referência; a cotação
  intradiária vem sempre acompanhada do aviso de fonte.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from .. import config

FONTE = "brapi.dev (AGREGADOR — não oficial; uso indicativo autorizado pelo usuário)"
AVISO = (
    "Cotação intradiária de agregador: NÃO é fonte primária, NÃO é usada em "
    "cálculos e pode divergir do oficial B3. Referência oficial: COTAHIST (D-1)."
)
_TIMEOUT_S = 10.0


class BrapiUnavailableError(RuntimeError):
    """brapi inacessível/recusou — o chamador decide o fallback (nunca 0)."""


def _token() -> str | None:
    return os.environ.get("IIOS_BRAPI_TOKEN") or None


def get_quote(ticker: str) -> dict:
    """Busca cotação intradiária indicativa de UM ticker B3.

    Retorna somente campos conhecidos e tipados; levanta BrapiUnavailableError
    em qualquer falha (rede, HTTP, payload inesperado)."""
    t = ticker.strip().upper()
    if not t.isalnum() or len(t) > 12:
        raise BrapiUnavailableError(f"ticker inválido: {ticker!r}")
    url = f"https://brapi.dev/api/quote/{urllib.parse.quote(t)}"
    headers = {"User-Agent": config.USER_AGENT}
    tok = _token()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        raise BrapiUnavailableError(f"brapi indisponível: {e}") from e

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list) or not results:
        raise BrapiUnavailableError("brapi: resposta sem resultados")
    r = results[0]
    if not isinstance(r, dict) or str(r.get("symbol", "")).upper() != t:
        raise BrapiUnavailableError("brapi: ticker divergente na resposta")

    def _num(key: str) -> float | None:
        v = r.get(key)
        return float(v) if isinstance(v, (int, float)) else None

    preco = _num("regularMarketPrice")
    if preco is None:
        raise BrapiUnavailableError("brapi: sem preço no payload")
    return {
        "ticker": t,
        "preco": preco,
        "variacao_pct": _num("regularMarketChangePercent"),
        "fechamento_anterior": _num("regularMarketPreviousClose"),
        "data_hora": str(r.get("regularMarketTime") or "") or None,
        "moeda": str(r.get("currency") or "BRL"),
        "fonte": FONTE,
        "aviso": AVISO,
        "usavel_em_calculos": False,
        "token_configurado": tok is not None,
    }
