"""Ingestão bronze das séries macro do BCB (SGS) e expectativas (Focus/Olinda).

Séries do MVP macro Brasil (docs/SOURCE_REGISTRY.md). Cada download é um JSON
bronze imutável auditado. Point-in-time: o SGS pode publicar vigência FUTURA
(ex.: meta Selic) — o silver trunca em data <= data da ingestão.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

from .base import fetch_bronze

# série SGS -> (id interno, descrição, unidade, frequência)
SGS_SERIES: dict[int, tuple[str, str, str, str]] = {
    432: ("selic_meta", "Meta Selic definida pelo Copom", "% a.a.", "diaria"),
    4389: ("cdi_anual", "CDI anualizado base 252", "% a.a.", "diaria"),
    433: ("ipca_mensal", "IPCA variação mensal (IBGE via SGS)", "% a.m.", "mensal"),
    1: ("ptax_venda", "Dólar comercial PTAX venda", "BRL/USD", "diaria"),
    24363: ("ibc_br", "IBC-Br índice de atividade econômica (dessaz.)", "índice", "mensal"),
    189: ("igp_m", "IGP-M variação mensal (FGV via SGS)", "% a.m.", "mensal"),
    13762: ("divida_bruta_pib", "Dívida bruta do governo geral (% PIB)", "% PIB", "mensal"),
}

FOCUS_INDICATORS = ("IPCA", "Selic", "Câmbio", "PIB Total")


def ingest_sgs(codigo: int, years: int = 9, cache_file: Path | None = None) -> Path:
    """Consulta por intervalo de datas (a API limita 'ultimos/N' a 20 valores e
    intervalos a 10 anos para séries diárias)."""
    today = date.today()
    start = date(today.year - years, 1, 1)
    url = (
        f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json"
        f"&dataInicial={start.strftime('%d/%m/%Y')}&dataFinal={today.strftime('%d/%m/%Y')}"
    )
    return fetch_bronze(
        "bcb_sgs", url, f"sgs_{codigo}_{today.isoformat()}.json", cache_file=cache_file
    )


def ingest_focus(indicador: str, top: int = 200, cache_file: Path | None = None) -> Path:
    filtro = indicador.replace(" ", "%20").replace("â", "%C3%A2")
    url = (
        "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
        "ExpectativasMercadoAnuais?%24top="
        f"{top}&%24filter=Indicador%20eq%20'{filtro}'&%24orderby=Data%20desc&%24format=json"
    )
    safe = indicador.lower().replace(" ", "_").replace("â", "a")
    return fetch_bronze(
        "bcb_focus", url, f"focus_{safe}_{date.today().isoformat()}.json", cache_file=cache_file
    )


def ingest_all() -> dict:
    out: dict = {"sgs": {}, "focus": {}}
    for codigo in SGS_SERIES:
        out["sgs"][codigo] = ingest_sgs(codigo)
    for ind in FOCUS_INDICATORS:
        try:
            out["focus"][ind] = ingest_focus(ind)
        except RuntimeError as exc:  # Focus é complementar; falha não bloqueia
            out["focus"][ind] = f"FALHOU: {exc}"
    return out
