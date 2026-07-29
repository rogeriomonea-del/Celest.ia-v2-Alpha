"""Relatórios Ativo 360 dos ativos da demonstração (ADR-0003).

Ativos escolhidos por liquidez/disponibilidade de dados — NÃO são recomendação.
Inclui análise documental com citações por página quando o download oficial
está disponível.
"""
from __future__ import annotations

import json
from pathlib import Path

from .. import config
from ..silver import quotes as sv_quotes

DEMO_ASSETS = ["VALE3", "PETR4", "WEGE3", "ITUB4", "AZZA3", "GMAT3", "RECV3"]
FII_ASSETS = ["HGLG11"]

_DOC_KEYWORDS = ["receita", "lucro líquido", "dívida", "fluxo de caixa", "dividendos", "auditor"]


def _screener_data() -> dict:
    return json.loads(
        (config.GOLD_DIR / "screener_quality_deep_value.json").read_text(encoding="utf-8")
    )


def _find_company(data: dict, ticker: str) -> dict | None:
    for e in data["empresas"]:
        if ticker in (e.get("ticker") or "").split(","):
            return e
    return None


def _doc_section(cd_cvm: str, doc_label: str, link_doc: str) -> list[str]:
    """Baixa o documento oficial mais recente e produz citações verificáveis."""
    from ..documents.cite import citations_to_markdown, extract_pages, find_citations, save_pages, verify_citation
    from ..documents.fetch import fetch_enet_package

    try:
        meta = fetch_enet_package(cd_cvm, doc_label, link_doc)
    except Exception as exc:  # rede pode falhar; nunca inventar conteúdo
        return [f"Download do documento oficial falhou ({type(exc).__name__}); nenhuma análise documental gerada.", ""]
    if not meta.get("pdf_path"):
        return ["Pacote ENET sem PDF; análise documental indisponível.", ""]
    pages = extract_pages(Path(meta["pdf_path"]))
    save_pages(pages, config.DOCUMENTS_DIR / cd_cvm / f"{doc_label.replace('/', '-')}.pages.jsonl", meta["pdf_sha256"])
    citations = find_citations(pages, meta["pdf_sha256"], _DOC_KEYWORDS)
    citations = [c for c in citations if verify_citation(pages, c)]
    lines = [
        f"Documento baixado de fonte oficial (CVM/ENET), sha256 `{meta['pdf_sha256'][:16]}…`, {len(pages)} páginas.",
        "",
        citations_to_markdown(citations, doc_label, meta["url"]),
        "",
        "_Atenção: as citações localizam trechos por palavra-chave e podem referir-se às demonstrações "
        "INDIVIDUAIS ou CONSOLIDADAS do documento — confira a página indicada. Os indicadores deste "
        "relatório usam sempre o CONSOLIDADO._",
        "",
    ]
    (config.GOLD_DIR / f"citations_{cd_cvm}.json").write_text(
        json.dumps({"doc": meta, "citations": [c.__dict__ for c in citations]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return lines


def _metric_line(label: str, value: str, source: str, database: str | None) -> str:
    return f"| {label} | {value} | {source} | {database or '—'} |"


def _series_section(cd_cvm: str) -> list[str]:
    """Séries anuais e trimestrais (receita e lucro), com comparação vs 3T25.

    3T25 é usado apenas como base histórica de comparação; o último período é
    sempre detectado dinamicamente.
    """
    from ..screener.build_gold import CompanyFacts, merged_net_income
    from ..silver import statements as sv_statements

    facts = sv_statements.load_facts()
    f = facts[facts["cd_cvm"] == cd_cvm]
    if f.empty:
        return []
    cf = CompanyFacts(f)
    rev_a = cf.annual_series("DRE", cd_conta="3.01")
    ni_a, ni_q, _ltm, _note = merged_net_income(cf)
    rev_q = cf.quarters("DRE", cd_conta="3.01")

    out = ["", "## Séries (R$ milhões — CVM DFP/ITR consolidado, as reported)", ""]
    years = sorted(set(rev_a) | set(ni_a))[-5:]
    out += ["| Exercício | Receita | Lucro atribuível |", "|---|---|---|"]
    for y in years:
        rv = f"{rev_a[y] / 1e6:,.0f}" if y in rev_a else "indisponível"
        nv = f"{ni_a[y] / 1e6:,.0f}" if y in ni_a else "indisponível"
        out.append(f"| {y} | {rv} | {nv} |")

    def _label(p):
        return f"{p.end.year}T{(p.end.month + 2) // 3}"

    quarters = {_label(p): p for p in rev_q}
    ni_by_label = {_label(p): p for p in ni_q}
    if quarters:
        out += ["", "| Trimestre isolado | Receita | Lucro |", "|---|---|---|"]
        for lbl in sorted(quarters, key=lambda k: quarters[k].end)[-6:]:
            p = quarters[lbl]
            nq = ni_by_label.get(lbl)
            out.append(
                f"| {lbl} | {p.value / 1e6:,.0f} | {(nq.value / 1e6) if nq else float('nan'):,.0f} |"
                if nq
                else f"| {lbl} | {p.value / 1e6:,.0f} | indisponível |"
            )
        last_lbl = max(quarters, key=lambda k: quarters[k].end)
        if "2025T3" in quarters and last_lbl != "2025T3":
            base, last = quarters["2025T3"], quarters[last_lbl]
            if base.value > 0:
                out += [
                    "",
                    f"Comparação histórica com 3T25: receita {last_lbl} = {last.value / 1e6:,.0f} vs 3T25 = "
                    f"{base.value / 1e6:,.0f} ({(last.value / base.value - 1) * 100:+.1f}%). "
                    "Trimestres de estações diferentes: sazonalidade pode explicar parte da variação.",
                ]
    return out


def build_company_report(e: dict, criteria: list[dict], with_docs: bool) -> Path:
    tk = (e["ticker"] or "").split(",")[0]
    md = [
        f"# {config.SYSTEM_NAME} — Ativo 360: {e['ticker']} ({e['empresa']})",
        "",
        f"- Código CVM: {e['cd_cvm']} | Setor (cadastro CVM): {e['setor']}",
        f"- Última demonstração disponível: **{e['ultima_demonstracao']}** (recebida pela CVM em {e['dt_receb_ultimo_doc']}) — detectada dinamicamente, nunca fixada.",
        f"- Status no screener: **{e['status']}**",
        "",
        "## Indicadores (todos com fonte, data-base e status)",
        "",
        "| Métrica | Valor | Fonte | Data-base |",
        "|---|---|---|---|",
        _metric_line("Preço (fechamento, NÃO ajustado)", f"data {e['preco_data']}", "B3 COTAHIST", e["preco_data"]),
        _metric_line("Valor de mercado", f"R$ {float(e['valor_mercado_brl']) / 1e9:.1f} bi" if e.get("valor_mercado_brl") else "indisponível", "B3 + CVM composição de capital", e["preco_data"]),
        _metric_line("P/L (LTM)", str(e["pl"]), "CVM DFP/ITR + B3", e["ultima_demonstracao"]),
        _metric_line("P/VPA", str(e["pvpa"]), "CVM DFP/ITR + B3", e["ultima_demonstracao"]),
        _metric_line("ROE LTM", f"{e['roe_ltm']}%", "CVM DFP/ITR", e["ultima_demonstracao"]),
        _metric_line("ROE mediano 5a", f"{e['roe_med5']}%", "CVM DFP", e["ultima_demonstracao"]),
        _metric_line("Dívida líq./EBITDA (proxy)", str(e["div_liq_ebitda"]), "CVM DFP/ITR", e["ultima_demonstracao"]),
        _metric_line("CAGR receita 5a", f"{e['cagr_receita']}% a.a.", "CVM DFP", e["ultima_demonstracao"]),
        _metric_line("CAGR lucro 5a", f"{e['cagr_lucro']}% a.a.", "CVM DFP", e["ultima_demonstracao"]),
        _metric_line("Conversão de caixa (CFO/lucro)", str(e["conversao_caixa"]), "CVM DFP/ITR", e["ultima_demonstracao"]),
        _metric_line("Liquidez média 63 pregões", f"R$ {float(e['liquidez_63d_brl']) / 1e6:.1f}M/dia" if e.get("liquidez_63d_brl") else "indisponível", "B3 COTAHIST", e["preco_data"]),
        _metric_line("Dividend yield", "indisponível (eventos corporativos não ingeridos no MVP)", "—", None),
        "",
        "## Avaliação pelos critérios do preset",
        "",
        "| Critério | Resultado | Detalhe |",
        "|---|---|---|",
    ]
    for c in criteria:
        md.append(f"| {c['criterio']} | {c['resultado']} | {c['detalhe']} |")

    md += _series_section(e["cd_cvm"])

    md += ["", "## Análise documental (último documento oficial)", ""]
    if with_docs and e.get("link_doc"):
        md += _doc_section(e["cd_cvm"], f"{e['ultima_demonstracao']}", e["link_doc"])
    else:
        md += ["Análise documental não executada para este ativo nesta rodada.", ""]

    md += [
        "## Limitações e classificação de evidência",
        "",
        "- FATO VERIFICADO: demonstrações CVM e preços B3 (com hash de ingestão).",
        "- INFERÊNCIA DO SISTEMA: indicadores derivados (fórmulas testadas em `investment_os/engine/`).",
        "- DADO AUSENTE: dividend yield, retorno total ajustado, ressalvas de auditoria, free float, WACC.",
        "- Preços B3 não ajustados por proventos; nada aqui é retorno total.",
        "- Este relatório é apoio à pesquisa. NÃO é recomendação de compra ou venda.",
    ]
    out = config.REPORTS_DIR / f"asset360_{tk}.md"
    out.write_text("\n".join(md), encoding="utf-8")
    return out


def build_fii_report(ticker: str) -> Path:
    """FII no MVP: apenas dados de mercado (ADR-0003) — sem indicadores contábeis."""
    prices = sv_quotes.load()
    sub = prices[prices["ticker"] == ticker].sort_values("trade_date")
    md = [f"# {config.SYSTEM_NAME} — Ativo 360: {ticker} (FII)", ""]
    if sub.empty:
        md += ["Sem série de preços disponível no COTAHIST ingerido.", ""]
    else:
        last = sub.iloc[-1]
        liq = sub.tail(63)["volume_fin"].mean()
        md += [
            "| Métrica | Valor | Fonte | Data-base |",
            "|---|---|---|---|",
            f"| Preço de fechamento | R$ {float(last['close']):.2f} | B3 COTAHIST | {last['trade_date']} |",
            f"| Liquidez média 63 pregões | R$ {liq / 1e6:.1f}M/dia | B3 COTAHIST | {last['trade_date']} |",
            "| P/VP, FFO, vacância, dividendos | indisponível | informes CVM de FII não integrados no MVP (ADR-0003) | — |",
            "",
            "As demonstrações de FIIs vivem em dataset CVM próprio, com plano de contas específico; "
            "a integração está no roadmap (Fase 5/6). Nenhum indicador fundamentalista é exibido para "
            "não misturar estruturas incompatíveis.",
        ]
    out = config.REPORTS_DIR / f"asset360_{ticker}.md"
    out.write_text("\n".join(md), encoding="utf-8")
    return out


def build_all(with_docs: bool = True) -> list[Path]:
    data = _screener_data()
    out: list[Path] = []
    docs_done = 0
    for tk in DEMO_ASSETS:
        e = _find_company(data, tk)
        if e is None:
            continue
        # análise documental completa para as aprovadas (limite de 3 downloads)
        use_docs = with_docs and e["status"] == "APROVADA" and docs_done < 3
        out.append(build_company_report(e, e.get("criterios", []), use_docs))
        if use_docs:
            docs_done += 1
    for tk in FII_ASSETS:
        out.append(build_fii_report(tk))
    return out
