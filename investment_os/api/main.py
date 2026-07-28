"""API somente leitura sobre os artefatos gold.

Contrato de dados para o frontend (Celst.ia-Finance) — toda resposta carrega
fonte e data-base. Rode: uvicorn investment_os.api.main:app
"""
from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException

from .. import config

app = FastAPI(
    title=config.SYSTEM_NAME,
    description="API de leitura dos artefatos gold (fontes oficiais: CVM, B3, Tesouro).",
    version="0.1.0",
)


def _gold(name: str) -> dict:
    path = config.GOLD_DIR / name
    if not path.exists():
        raise HTTPException(404, f"artefato gold ausente: {name} — rode o pipeline (cli build/report)")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "system": config.SYSTEM_NAME}


@app.get("/v1/screener")
def screener() -> dict:
    return _gold("screener_quality_deep_value.json")


@app.get("/v1/assets")
def assets() -> list[dict]:
    data = _gold("screener_quality_deep_value.json")
    return [
        {k: e.get(k) for k in ("ticker", "empresa", "cd_cvm", "setor", "status", "preco_data", "ultima_demonstracao")}
        for e in data["empresas"]
    ]


@app.get("/v1/assets/{ticker}")
def asset(ticker: str) -> dict:
    data = _gold("screener_quality_deep_value.json")
    for e in data["empresas"]:
        if ticker.upper() in (e.get("ticker") or "").split(","):
            return e
    raise HTTPException(404, f"ativo {ticker} não encontrado no universo gold")


@app.get("/v1/tesouro/ipca2050")
def tesouro() -> dict:
    return _gold("tesouro_ipca2050.json")
