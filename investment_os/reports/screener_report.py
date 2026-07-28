"""Relatório do screener + ranking provisório (sem forçar vencedoras).

O ranking do MVP é QUANTITATIVO: qualidade de negócio, governança e vantagens
competitivas ainda não são avaliadas (fases 4+); a confiança é reduzida e as
pendências são explícitas. Red flags determinísticas (saltos anômalos de
receita, conversão de caixa fraca) entram como contra-tese.
"""
from __future__ import annotations

import json
from pathlib import Path

from .. import config


def _load() -> dict:
    return json.loads(
        (config.GOLD_DIR / "screener_quality_deep_value.json").read_text(encoding="utf-8")
    )


def _red_flags(emp: dict) -> list[str]:
    flags = []
    try:
        conv = float(emp.get("conversao_caixa"))
        if conv < 0.8:
            flags.append(
                f"conversão de caixa {conv:.2f}x < 0,8x: lucro não plenamente suportado por caixa"
            )
    except (TypeError, ValueError):
        flags.append("conversão de caixa indisponível")
    return flags


def build() -> Path:
    data = _load()
    empresas = data["empresas"]
    aprovadas = [e for e in empresas if e["status"] == "APROVADA"]
    quase = [e for e in empresas if e["status"] == "QUASE_APROVADA"]
    counts = {}
    for e in empresas:
        counts[e["status"]] = counts.get(e["status"], 0) + 1

    md = [
        f"# {config.SYSTEM_NAME} — Screener `Quality Deep Value` v{data['preset']['version']}",
        "",
        f"Execução: {data['run_date']} | Universo: {len(empresas)} companhias ativas com DFP consolidada (CVM) | "
        f"Fontes: CVM (dados.cvm.gov.br), B3 COTAHIST (preços NÃO ajustados por proventos)",
        "",
        f"Resultado: **{counts.get('APROVADA', 0)} aprovadas**, {counts.get('QUASE_APROVADA', 0)} quase aprovadas, "
        f"{counts.get('REPROVADA', 0)} reprovadas, {counts.get('DADOS_INSUFICIENTES', 0)} com dados insuficientes.",
        "",
        "Critérios do preset NÃO avaliáveis no MVP (pendência explícita, válida para TODAS as empresas):",
    ]
    for p in data["pendencias_globais_do_preset"]:
        md.append(f"- {p}")

    md += ["", "## Aprovadas", ""]
    if not aprovadas:
        md.append("Nenhuma empresa passou em todos os critérios avaliáveis — resultado não forçado.")
    else:
        md += [
            "| Ticker | Empresa | Setor | Preço (data) | P/L | P/VPA | ROE med5 | DL/EBITDA | CAGR receita | CAGR lucro | Liquidez 63d |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
        for e in aprovadas:
            liq = f"R$ {float(e['liquidez_63d_brl']) / 1e6:.1f}M" if e.get("liquidez_63d_brl") else "indisponível"
            md.append(
                f"| {e['ticker']} | {e['empresa']} | {e['setor']} | {e['preco_data']} | {e['pl']} | {e['pvpa']} | "
                f"{e['roe_med5']}% | {e['div_liq_ebitda']} | {e['cagr_receita']}% | {e['cagr_lucro']}% | {liq} |"
            )

    md += ["", "## Ranking provisório (máx. 3, quantitativo — confiança LIMITADA)", ""]
    md += [
        "Aviso: sem análise documental completa, de governança e de vantagens competitivas "
        "(fases 4+), este ranking usa somente evidência quantitativa das demonstrações "
        "oficiais e preços B3. NÃO é recomendação de compra.",
        "",
    ]
    for i, e in enumerate(sorted(aprovadas, key=lambda x: float(x["pl"]) if _is_num(x["pl"]) else 99)[:3], start=1):
        flags = _red_flags(e)
        md += [
            f"### {i}. {e['ticker']} — {e['empresa']}",
            "",
            f"- Por que entrou (FATO VERIFICADO): passou em todos os critérios avaliáveis do preset "
            f"(P/L {e['pl']}x, P/VPA {e['pvpa']}x, ROE mediano 5a {e['roe_med5']}%, CAGR receita {e['cagr_receita']}% a.a., "
            f"CAGR lucro {e['cagr_lucro']}% a.a., DL/EBITDA {e['div_liq_ebitda']}x).",
            f"- Última demonstração: {e['ultima_demonstracao']} (recebida pela CVM em {e['dt_receb_ultimo_doc']}).",
            f"- Contra-tese / red flags determinísticas: {('; '.join(flags)) if flags else 'nenhuma flag quantitativa disparada'}.",
            "- PREMISSA DO MODELO: CAGR pode incluir crescimento inorgânico (fusões/aquisições) — verificação documental pendente.",
            "- DADO AUSENTE: ressalvas de auditoria, free float, governança, consenso setorial qualitativo.",
            f"- Confiança: BAIXA-MÉDIA (quantitativo puro). Gatilho de revisão: próximo ITR/DFP ou reapresentação.",
            "",
        ]

    md += ["", "## Quase aprovadas (critério exato que falhou)", ""]
    md += ["| Ticker | Empresa | Critérios reprovados | Não avaliados |", "|---|---|---|---|"]
    for e in quase:
        md.append(
            f"| {e['ticker'] or '—'} | {e['empresa']} | {e['criterios_reprovados'] or '—'} | {e['criterios_nao_avaliados'] or '—'} |"
        )

    md += [
        "",
        "---",
        "Tabela completa: `data/gold/screener_quality_deep_value.csv` (com fonte e data-base por linha). ",
        "Valores 'indisponivel'/'prejuizo'/'dado_insuficiente' nunca são exibidos como 0.",
    ]

    out = config.REPORTS_DIR / "screener_quality_deep_value.md"
    out.write_text("\n".join(md), encoding="utf-8")

    # HTML simples (mesmo conteúdo, tabela renderizada)
    html_out = config.REPORTS_DIR / "screener_quality_deep_value.html"
    try:
        import markdown  # type: ignore

        html_out.write_text(markdown.markdown("\n".join(md), extensions=["tables"]), encoding="utf-8")
    except ImportError:
        html_out.write_text(
            "<pre>" + "\n".join(md).replace("&", "&amp;").replace("<", "&lt;") + "</pre>",
            encoding="utf-8",
        )
    return out


def _is_num(s) -> bool:
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False
