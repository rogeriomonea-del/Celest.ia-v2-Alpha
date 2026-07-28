"""API v1 do chat "Pergunte à IA" (Fase 7).

POST /v1/chat — pergunta em linguagem natural -> resposta ESTRUTURADA
(evidências, fontes, data-base, premissas, confiança, riscos, contra-argumento,
dados ausentes) + trace de ferramentas. 503 estruturado sem ANTHROPIC_API_KEY.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..chat import orchestrator
from ..chat.tools import TOOL_DEFINITIONS

router = APIRouter(prefix="/v1", tags=["fase7"])


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


class HistoricoItem(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class ChatIn(BaseModel):
    pergunta: str = Field(min_length=3, max_length=4000)
    historico: list[HistoricoItem] = Field(default_factory=list, max_length=20)


@router.get("/chat/ferramentas")
def ferramentas() -> dict:
    """Lista as ferramentas determinísticas disponíveis ao chat (transparência)."""
    return {"ferramentas": [
        {"nome": t["name"], "descricao": t["description"]} for t in TOOL_DEFINITIONS
    ], "nota": "O LLM nunca calcula: todo número vem destas ferramentas, com fonte e data-base."}


@router.post("/chat")
def chat(body: ChatIn) -> dict:
    try:
        return orchestrator.ask(
            body.pergunta,
            [h.model_dump() for h in body.historico],
        )
    except orchestrator.ChatUnavailableError as exc:
        raise _error(503, "chat_indisponivel", str(exc))
    except ValueError as exc:
        raise _error(422, "pergunta_invalida", str(exc))
