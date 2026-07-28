"""Presets de screening versionados.

Regra: critérios NUNCA são afrouxados silenciosamente. Todo critério retorna
PASS / FAIL / NOT_EVALUATED (com motivo). Aprovada = zero FAIL e zero
NOT_EVALUATED por dado ausente do lado da empresa; critérios estruturalmente
não avaliáveis no MVP (fonte não integrada) são listados como pendência
explícita em TODAS as empresas.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..engine.metrics import Metric, Status


@dataclass(frozen=True)
class CriterionResult:
    criterion: str
    outcome: str  # PASS | FAIL | NOT_EVALUATED
    detail: str


QUALITY_DEEP_VALUE_V1 = {
    "preset_id": "quality_deep_value",
    "version": 1,
    "params": {
        "pvpa_max": 1.0,
        "pe_sector_percentile_max": 35,
        "pe_abs_max_fallback": 12.0,
        "min_sector_peers": 5,
        "roe_med5_min": 0.12,
        "nd_ebitda_max": 3.0,
        "rev_cagr_min": 0.10,
        "ni_cagr_min": 0.10,
        "max_rev_decline": -0.15,
        "cfo_pos_min_5y": 4,
        "fcf_pos_min_5y": 3,
        "min_liquidity_brl_day": 5_000_000.0,
    },
    # Critérios do preset que o MVP ainda não consegue avaliar (fonte não
    # integrada). São reportados como pendência explícita, nunca omitidos.
    "not_evaluated_mvp": [
        "ausência de ressalva material não resolvida do auditor (pareceres não integrados)",
        "free float mínimo (FRE distribuição de capital não integrado)",
        "sem deterioração material recente da tese (análise qualitativa pendente)",
    ],
}


def _fmt(m: Metric, scale: float = 1.0, suffix: str = "") -> str:
    if m.value is None:
        return f"{m.status.value}: {m.note}" if m.note else m.status.value
    return f"{m.value * scale:.2f}{suffix}"


def evaluate_quality_deep_value(row: dict, pe_sector_p35: float | None, n_peers: int) -> list[CriterionResult]:
    p = QUALITY_DEEP_VALUE_V1["params"]
    out: list[CriterionResult] = []

    def add(name: str, metric_ok: bool, passed: bool, detail: str):
        out.append(
            CriterionResult(name, "PASS" if passed else "FAIL", detail)
            if metric_ok
            else CriterionResult(name, "NOT_EVALUATED", detail)
        )

    pvpa: Metric = row["pvpa"]
    add("P/VPA < 1", pvpa.ok, pvpa.ok and pvpa.value < p["pvpa_max"], _fmt(pvpa, suffix="x"))

    pe: Metric = row["pe"]
    if not pe.ok:
        # PREJUIZO é FAIL do critério "P/L positivo"; demais statuses = sem dado.
        if pe.status is Status.PREJUIZO:
            out.append(CriterionResult("P/L positivo e baixo", "FAIL", "prejuízo LTM"))
        else:
            out.append(CriterionResult("P/L positivo e baixo", "NOT_EVALUATED", _fmt(pe)))
    elif pe_sector_p35 is not None and n_peers >= p["min_sector_peers"]:
        passed = pe.value <= pe_sector_p35
        out.append(
            CriterionResult(
                "P/L positivo e baixo",
                "PASS" if passed else "FAIL",
                f"{pe.value:.2f}x vs P35 do setor {pe_sector_p35:.2f}x ({n_peers} pares)",
            )
        )
    else:
        passed = pe.value <= p["pe_abs_max_fallback"]
        out.append(
            CriterionResult(
                "P/L positivo e baixo",
                "PASS" if passed else "FAIL",
                f"{pe.value:.2f}x vs limite absoluto {p['pe_abs_max_fallback']:.0f}x "
                f"(setor com {n_peers} pares < {p['min_sector_peers']}: percentil indisponível — limitação declarada)",
            )
        )

    roe5: Metric = row["roe_med5"]
    add("ROE mediano 5a > 12%", roe5.ok, roe5.ok and roe5.value > p["roe_med5_min"], _fmt(roe5, 100, "%"))

    nde: Metric = row["nd_ebitda"]
    if nde.status is Status.NAO_APLICAVEL and row["is_financial"]:
        out.append(CriterionResult("Dívida líq./EBITDA < 3", "NOT_EVALUATED", "instituição financeira — critério substituído na fase setorial"))
    else:
        add("Dívida líq./EBITDA < 3", nde.ok, nde.ok and nde.value < p["nd_ebitda_max"], _fmt(nde, suffix="x"))

    rc: Metric = row["rev_cagr5"]
    add("CAGR receita > 10%", rc.ok, rc.ok and rc.value > p["rev_cagr_min"], _fmt(rc, 100, "% a.a."))
    nc: Metric = row["ni_cagr5"]
    add("CAGR lucro > 10%", nc.ok, nc.ok and nc.value > p["ni_cagr_min"], _fmt(nc, 100, "% a.a."))

    wr = row["pior_queda_receita"]
    if wr is None:
        out.append(CriterionResult("Receita estável (sem queda >15%)", "NOT_EVALUATED", "série de receita insuficiente"))
    else:
        out.append(
            CriterionResult(
                "Receita estável (sem queda >15%)",
                "PASS" if wr > p["max_rev_decline"] else "FAIL",
                f"pior variação anual {wr * 100:.1f}%",
            )
        )

    anos = row["anos_serie"]
    if len(anos) < 5:
        out.append(CriterionResult("Lucro positivo nos 5 anos", "NOT_EVALUATED", f"apenas {len(anos)} exercícios"))
    else:
        out.append(
            CriterionResult(
                "Lucro positivo nos 5 anos",
                "PASS" if row["lucro_positivo_todos_5a"] else "FAIL",
                f"exercícios {anos[0]}–{anos[-1]}",
            )
        )

    out.append(
        CriterionResult(
            "CFO positivo em >=4 dos 5 anos",
            "PASS" if row["cfo_positivo_5a"] >= p["cfo_pos_min_5y"] else "FAIL",
            f"{row['cfo_positivo_5a']}/5 anos positivos",
        )
        if not row["is_financial"]
        else CriterionResult("CFO positivo em >=4 dos 5 anos", "NOT_EVALUATED", "instituição financeira — DFC não comparável")
    )
    out.append(
        CriterionResult(
            "FCF positivo em >=3 dos 5 anos",
            "PASS" if row["fcf_positivo_5a"] >= p["fcf_pos_min_5y"] else "FAIL",
            f"{row['fcf_positivo_5a']}/5 anos positivos (FCF proxy = CFO - CAPEX)",
        )
        if not row["is_financial"]
        else CriterionResult("FCF positivo em >=3 dos 5 anos", "NOT_EVALUATED", "instituição financeira")
    )

    liq = row["liquidez_media_63d_brl"]
    if liq is None:
        out.append(CriterionResult("Liquidez >= R$5M/dia", "NOT_EVALUATED", "sem série de preços B3 vinculada"))
    else:
        out.append(
            CriterionResult(
                "Liquidez >= R$5M/dia",
                "PASS" if liq >= p["min_liquidity_brl_day"] else "FAIL",
                f"R$ {liq / 1e6:.1f}M/dia (média 63 pregões)",
            )
        )
    return out
