"""Relatório do Tesouro IPCA+ 2050: janelas históricas, risco e cenários MTM.

Recalculado SEMPRE a partir do dataset atualizado; o limite (default 7,11%,
IIOS_REFERENCE_RATE_PCT) nunca é fixado no produto.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from .. import config
from ..engine.fixed_income import mtm_scenarios, risk_profile
from ..engine.windows import analyze
from ..silver import tesouro as sv_tesouro

TITULO = "Tesouro IPCA+"
VENCIMENTO = date(2050, 8, 15)
COMPARE_MATURITIES = (date(2029, 5, 15), date(2035, 5, 15), date(2045, 5, 15), date(2050, 8, 15))


def build() -> Path:
    df = sv_tesouro.load()
    threshold = config.REFERENCE_RATE_PCT

    main = df[(df["tipo_titulo"] == TITULO) & (df["dt_vencimento"] == VENCIMENTO)]
    if main.empty:
        raise RuntimeError("série do Tesouro IPCA+ 2050 ausente no silver")
    series = list(zip(main["data_base"], main["taxa_compra_manha"].astype(float)))
    a = analyze(series, threshold)
    last_row = main.sort_values("data_base").iloc[-1]
    last_rate = float(last_row["taxa_compra_manha"])
    last_date = last_row["data_base"]
    rp = risk_profile(last_date, VENCIMENTO, last_rate, with_coupons=False)
    scenarios = mtm_scenarios(last_date, VENCIMENTO, last_rate, with_coupons=False)

    hist_start = df["data_base"].min()

    md = [
        f"# {config.SYSTEM_NAME} — Tesouro IPCA+ 15/08/2050",
        "",
        f"- Fonte: Tesouro Transparente (CSV oficial precotaxatesourodireto.csv)",
        f"- Data-base mais recente: **{last_date.isoformat()}** | Taxa Compra Manhã: **IPCA + {last_rate:.2f}% a.a.** | PU compra: R$ {float(last_row['pu_compra_manha']):.2f}",
        f"- Série DESTE título: {a.first_date.isoformat()} a {a.last_date.isoformat()} ({a.total_sessions} pregões)",
        f"- Histórico oficial do Tesouro Direto (todos os títulos) inicia em {hist_start.isoformat()}; o programa começou em 2002 — o sistema NÃO possui 30 anos de história e não usa proxy não oficial.",
        "",
        f"## Janela histórica vs limite IPCA + {threshold:.2f}%",
        "",
        f"| Métrica | Valor |",
        f"|---|---|",
        f"| Pregões disponíveis | {a.total_sessions} |",
        f"| Pregões com taxa ≥ {threshold:.2f}% | {a.sessions_at_or_above} ({a.fraction * 100:.2f}%) |",
        f"| Janelas contínuas | {len(a.windows)} |",
        f"| Maior janela | {a.longest_window.sessions if a.longest_window else 0} pregões ({a.longest_window.start.isoformat()} a {a.longest_window.end.isoformat()}) |" if a.longest_window else "| Maior janela | — |",
        f"| Última ocorrência | {a.last_occurrence.isoformat() if a.last_occurrence else '—'} |",
        f"| Percentil do limite na série | {a.threshold_percentile:.1f}% |",
        f"| Máxima / mínima | {a.max_rate:.2f}% / {a.min_rate:.2f}% |",
        f"| Média / mediana | {a.mean_rate:.2f}% / {a.median_rate:.2f}% |",
        "",
        "Janelas contínuas (pregões consecutivos na série com taxa ≥ limite):",
        "",
        "| Início | Fim | Pregões |",
        "|---|---|---|",
    ]
    for w in a.windows:
        md.append(f"| {w.start.isoformat()} | {w.end.isoformat()} | {w.sessions} |")

    md += [
        "",
        "## Perfil de risco (na taxa atual)",
        "",
        "Fluxo real de título principal (zero-coupon em termos reais); convenção de prazo ACT/365.25 (aproximação documentada em docs/ASSUMPTIONS.md).",
        "",
        f"| Duration Macaulay | {rp.macaulay_duration_years:.2f} anos |",
        f"|---|---|",
        f"| Modified duration | {rp.modified_duration_years:.2f} anos |",
        f"| DV01 | R$ {rp.dv01_brl:.4f} por título |",
        f"| Convexidade | {rp.convexity:.1f} |",
        "",
        "## Cenários de marcação a mercado (choques paralelos na taxa real)",
        "",
        "| Choque | Taxa | PU novo | Variação | Efeito duration | Efeito convexidade |",
        "|---|---|---|---|---|---|",
    ]
    for s in scenarios:
        md.append(
            f"| {s['choque_bps']:+d} bps | {s['taxa_pct']:.2f}% | R$ {s['pu_novo']:.2f} | "
            f"{s['variacao_pct']:+.2f}% | R$ {s['efeito_duration_brl']:+.2f} | R$ {s['efeito_convexidade_brl']:+.2f} |"
        )

    md += [
        "",
        "## Comparação por vencimento (instrumentos DISTINTOS — nunca misturados)",
        "",
        "| Título | Vencimento | Taxa atual | Data-base | Pregões ≥ limite / total | Duration mod. |",
        "|---|---|---|---|---|---|",
    ]
    for mat in COMPARE_MATURITIES:
        sub = df[(df["tipo_titulo"] == TITULO) & (df["dt_vencimento"] == mat)]
        if sub.empty:
            continue
        s2 = list(zip(sub["data_base"], sub["taxa_compra_manha"].astype(float)))
        a2 = analyze(s2, threshold)
        r2 = sub.sort_values("data_base").iloc[-1]
        rate2, d2 = float(r2["taxa_compra_manha"]), r2["data_base"]
        rp2 = risk_profile(d2, mat, rate2, with_coupons=False)
        md.append(
            f"| {TITULO} | {mat.isoformat()} | IPCA + {rate2:.2f}% | {d2.isoformat()} | "
            f"{a2.sessions_at_or_above} / {a2.total_sessions} ({a2.fraction * 100:.1f}%) | {rp2.modified_duration_years:.1f} a |"
        )

    md += [
        "",
        "---",
        "FATO VERIFICADO: taxas e PUs do CSV oficial. INFERÊNCIA DO SISTEMA: duration/DV01/convexidade e cenários (fórmulas em investment_os/engine/fixed_income.py, testadas). ",
        "Este relatório é apoio à decisão; não é recomendação nem promessa de retorno. Taxas do Tesouro Direto (varejo) — não misturar com taxas indicativas ANBIMA.",
    ]

    out = config.REPORTS_DIR / "tesouro_ipca2050.md"
    out.write_text("\n".join(md), encoding="utf-8")

    gold = {
        "titulo": TITULO,
        "vencimento": VENCIMENTO.isoformat(),
        "data_base": last_date.isoformat(),
        "taxa_atual_pct": last_rate,
        "threshold_pct": threshold,
        "janela": a.to_dict(),
        "risco": {
            "duration_macaulay_anos": rp.macaulay_duration_years,
            "modified_duration_anos": rp.modified_duration_years,
            "dv01_brl": rp.dv01_brl,
            "convexidade": rp.convexity,
        },
        "cenarios_mtm": scenarios,
        "fonte": "tesouro_transparente",
    }
    (config.GOLD_DIR / "tesouro_ipca2050.json").write_text(
        json.dumps(gold, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    return out
