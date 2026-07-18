"""Narrativa analítica do relatório: API da Anthropic com fallback heurístico.

Quando o SDK ``anthropic`` está instalado e há credencial disponível
(``ANTHROPIC_API_KEY``/``ANTHROPIC_AUTH_TOKEN`` no ambiente, ou perfil do
``ant auth login`` com ``CELESTIA_USE_LLM=1``), a narrativa do relatório é
gerada pelo Claude. Sem SDK, sem credencial ou em caso de erro de API, a
narrativa heurística determinística assume — a plataforma nunca depende da
rede para funcionar.
"""
from __future__ import annotations

import json
from typing import Optional

from celestia_travel.config import Settings
from celestia_travel.models import DealEvaluation, FlightQuery

SYSTEM_PROMPT = (
    "Você é a analista de viagens da plataforma celest.ia. Receberá um JSON com "
    "as melhores ofertas encontradas por um sistema multi-agente de busca de "
    "passagens (com avaliação dinheiro vs. milhas). Escreva um parecer em "
    "português do Brasil com no máximo 3 parágrafos curtos: (1) a melhor "
    "oportunidade e por quê; (2) a recomendação sobre usar milhas ou dinheiro, "
    "citando o milheiro implícito; (3) alertas e próximo passo prático. Seja "
    "direta, use os números do JSON e não invente dados que não estejam nele."
)


def format_brl(value: float) -> str:
    """Formata um valor em reais no padrão pt-BR (1.234,56)."""
    return f"{value:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def format_int(value: int) -> str:
    """Formata um inteiro com separador de milhar pt-BR (87.450)."""
    return f"{value:,}".replace(",", ".")


def _payload(query: FlightQuery, evaluations: list[DealEvaluation]) -> str:
    return json.dumps(
        {
            "rota": query.route,
            "data_ida": query.depart_date.isoformat(),
            "flexibilidade_dias": query.flex_days,
            "passageiros": query.passengers,
            "ofertas": [
                {
                    "companhia": ev.offer.airline,
                    "voo": ev.offer.flight_number,
                    "data": ev.offer.depart_date.isoformat(),
                    "paradas": ev.offer.stops,
                    "preco_total_brl": ev.offer.total_cash,
                    "milhas": ev.offer.miles_price,
                    "programa": ev.offer.miles_program,
                    "milheiro_implicito": ev.cpm,
                    "vale_usar_milhas": ev.use_miles,
                    "score": ev.score,
                    "alertas": ev.flags,
                }
                for ev in evaluations
            ],
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def llm_narrative(
    query: FlightQuery,
    evaluations: list[DealEvaluation],
    settings: Settings,
) -> Optional[str]:
    """Gera a narrativa via Claude; retorna ``None`` quando indisponível."""
    if not settings.use_llm or not evaluations:
        return None

    try:
        import anthropic
    except ImportError:
        return None

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model=settings.llm_model,
            max_tokens=settings.llm_max_tokens,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Analise as ofertas e escreva o parecer:\n\n"
                        + _payload(query, evaluations)
                    ),
                }
            ],
        )
    except anthropic.AuthenticationError:
        return None
    except anthropic.RateLimitError:
        return None
    except anthropic.APIStatusError:
        return None
    except anthropic.APIConnectionError:
        return None

    if getattr(response, "stop_reason", None) == "refusal":
        return None

    text = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    ).strip()
    return text or None


def heuristic_narrative(
    query: FlightQuery,
    evaluations: list[DealEvaluation],
    milheiro_reference: float,
) -> str:
    """Narrativa determinística construída a partir das avaliações."""
    if not evaluations:
        return (
            f"Nenhuma oferta válida foi encontrada para {query.route} em "
            f"{query.depart_date.strftime('%d/%m/%Y')}. Amplie a janela de datas "
            "(--flex) ou configure provedores adicionais."
        )

    best = evaluations[0]
    offer = best.offer
    parts: list[str] = []

    stops_text = "direto" if offer.stops == 0 else f"{offer.stops} parada(s)"
    parts.append(
        f"A melhor oportunidade para {query.route} é o voo {offer.flight_number} "
        f"da {offer.airline} em {offer.depart_date.strftime('%d/%m/%Y')} às "
        f"{offer.depart_time}, por R$ {format_brl(offer.total_cash)} ({stops_text}), "
        f"com score {best.score:.1f}/10 entre {len(evaluations)} finalistas."
    )

    with_miles = [ev for ev in evaluations if ev.use_miles]
    if with_miles:
        top_miles = with_miles[0]
        assert top_miles.offer.miles_price is not None and top_miles.cpm is not None
        parts.append(
            f"Com milhas, destaque para {top_miles.offer.airline} "
            f"({top_miles.offer.miles_program}): {format_int(top_miles.offer.miles_price)} "
            f"milhas, milheiro implícito de R$ {format_brl(top_miles.cpm)} — acima da "
            f"sua referência de R$ {format_brl(milheiro_reference)}, ou seja, a emissão "
            "vale a pena."
        )
    elif any(ev.cpm is not None for ev in evaluations):
        parts.append(
            "Nenhuma emissão com milhas supera sua referência de "
            f"R$ {format_brl(milheiro_reference)} por 1.000 milhas nesta janela — "
            "pague em dinheiro e preserve o saldo."
        )

    flagged = [ev for ev in evaluations if ev.flags]
    if flagged:
        parts.append(
            f"Atenção: {len(flagged)} oferta(s) com alertas do auditor — "
            + " ".join(flagged[0].flags[:1])
        )

    return "\n\n".join(parts)
