"""Configuração via variáveis de ambiente."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Settings:
    """Parâmetros de execução da plataforma.

    Todos os valores têm defaults seguros: sem nenhuma variável de ambiente a
    plataforma roda 100% offline com o provedor de demonstração.
    """

    # Valor de referência do milheiro (R$ por 1.000 milhas) usado pelo agente
    # de avaliação para decidir se vale a pena emitir com milhas.
    milheiro_reference: float = 20.0

    # Provedores reais (opcionais)
    skyscanner_api_key: Optional[str] = None
    copa_api_url: Optional[str] = None

    # ConnectMiles (opcional; sem credenciais o cliente roda em modo mock)
    connectmiles_user: Optional[str] = None
    connectmiles_password: Optional[str] = None

    # Narrativa via API da Anthropic (opcional)
    llm_model: str = "claude-opus-4-8"
    llm_max_tokens: int = 1200
    use_llm: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        def _get(name: str) -> Optional[str]:
            value = os.environ.get(name, "").strip()
            return value or None

        milheiro_raw = _get("CELESTIA_MILHEIRO") or "20.0"
        try:
            milheiro = float(milheiro_raw.replace(",", "."))
        except ValueError:
            milheiro = 20.0

        # A narrativa via LLM é tentada quando há credencial explícita no
        # ambiente ou quando o usuário força com CELESTIA_USE_LLM=1 (útil para
        # autenticação via perfil `ant auth login`, que não usa env var).
        use_llm = bool(
            _get("ANTHROPIC_API_KEY")
            or _get("ANTHROPIC_AUTH_TOKEN")
            or (_get("CELESTIA_USE_LLM") in {"1", "true", "sim"})
        )

        return cls(
            milheiro_reference=milheiro,
            skyscanner_api_key=_get("SKYSCANNER_API_KEY"),
            copa_api_url=_get("COPA_API_URL"),
            connectmiles_user=_get("CONNECTMILES_USER"),
            connectmiles_password=_get("CONNECTMILES_PASSWORD"),
            llm_model=_get("CELESTIA_LLM_MODEL") or "claude-opus-4-8",
            use_llm=use_llm,
        )
