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
    description=(
        "API do Investment Intelligence OS. Leitura dos artefatos gold (fontes "
        "oficiais: CVM, B3, Tesouro) + Fase 5: perfil, IPS, importação de "
        "carteira, análise e rebalanceamento. Esquema de autorização Bearer "
        "declarado no contrato; autenticação completa na fase de produção."
    ),
    version="0.2.0",
)

from .assets_api import router as assets_router  # noqa: E402
from .chat_api import router as chat_router  # noqa: E402
from .macro_api import router as macro_router  # noqa: E402
from .portfolio_api import router as portfolio_router  # noqa: E402

app.include_router(portfolio_router)
app.include_router(macro_router)
app.include_router(assets_router)
app.include_router(chat_router)

# CORS para o frontend local (Celst.ia-Finance em dev). Sem credenciais.
try:
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
except ImportError:  # pragma: no cover
    pass


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
