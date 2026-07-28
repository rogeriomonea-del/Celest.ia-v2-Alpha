"""Painel Tesouro completo: todos os títulos ofertados, curvas, janelas e MTM.

Modelagem HONESTA por tipo (docs/adr/0005):
- Tesouro Prefixado: zero-coupon nominal -> modelado (cupom 0).
- Tesouro Prefixado com Juros Semestrais: cupom 10% a.a. nominal -> modelado.
- Tesouro IPCA+ / Renda+ / Educa+ (fase de acumulação zero-coupon real) ->
  IPCA+ principal modelado; Renda+/Educa+ NÃO modelados (fluxo de 240 parcelas
  na conversão — estrutura própria, fora do MVP).
- Tesouro IPCA+ com Juros Semestrais: cupom 6% a.a. real -> modelado.
- Tesouro IGPM+ com Juros Semestrais: legado, cupons variados -> NÃO modelado.
- Tesouro Selic: pós-fixado repactuado diariamente -> duration efetiva ~0;
  a "taxa" é o ágio/deságio sobre a Selic — risco de mercado NÃO modelado.

Curvas: pontos (vencimento, taxa de compra) da ÚLTIMA data-base — curva de
taxas OFERTADAS AO VAREJO pelo Tesouro Direto; NÃO é a curva indicativa ANBIMA.
Janela/radar: percentil da taxa atual na própria série do título + hysteresis.
"""
from __future__ import annotations

import json
from datetime import date

from .. import config
from ..engine.fixed_income import mtm_scenarios, risk_profile
from ..engine.windows import analyze
from ..silver import tesouro as sv_tesouro

MODELED: dict[str, dict] = {
    "Tesouro Prefixado": {"with_coupons": False, "coupon": 0.0, "termo": "nominal"},
    "Tesouro Prefixado com Juros Semestrais": {"with_coupons": True, "coupon": 0.10, "termo": "nominal"},
    "Tesouro IPCA+": {"with_coupons": False, "coupon": 0.0, "termo": "real"},
    "Tesouro IPCA+ com Juros Semestrais": {"with_coupons": True, "coupon": 0.06, "termo": "real"},
}
NOT_MODELED_REASON = {
    "Tesouro Selic": "pós-fixado repactuado diariamente: duration efetiva ~0; taxa exibida é ágio/deságio sobre a Selic",
    "Tesouro Renda+ Aposentadoria Extra": "fluxo de 240 parcelas mensais após a conversão — estrutura não modelada no MVP",
    "Tesouro Educa+": "fluxo de 48 parcelas mensais após a conversão — estrutura não modelada no MVP",
    "Tesouro IGPM+ com Juros Semestrais": "título legado (IGP-M), cupons heterogêneos — não modelado",
}

RADAR_PERCENTIL_ENTRADA = 80.0
RADAR_PERCENTIL_SAIDA = 70.0
MIN_SESSIONS_RADAR = 250
# títulos perto do vencimento têm taxa cotada distorcida — fora do radar
MIN_DIAS_ATE_VENCIMENTO_RADAR = 365


def _percentile_of(rates: list[float], value: float) -> float:
    below = sum(1 for r in rates if r < value)
    return below / len(rates) * 100.0 if rates else 0.0


def build() -> dict:
    df = sv_tesouro.load()
    last_db: date = df["data_base"].max()
    latest = df[df["data_base"] == last_db].sort_values(["tipo_titulo", "dt_vencimento"])

    titulos: list[dict] = []
    janelas: list[dict] = []
    for _, row in latest.iterrows():
        tipo = str(row["tipo_titulo"])
        venc: date = row["dt_vencimento"]
        taxa = float(row["taxa_compra_manha"])
        entry: dict = {
            "tipo": tipo,
            "vencimento": venc.isoformat(),
            "data_base": last_db.isoformat(),
            "taxa_compra_pct": taxa,
            "taxa_venda_pct": float(row["taxa_venda_manha"]) if row["taxa_venda_manha"] == row["taxa_venda_manha"] else None,
            "pu_compra": float(row["pu_compra_manha"]) if row["pu_compra_manha"] == row["pu_compra_manha"] else None,
            "pu_venda": float(row["pu_venda_manha"]) if row["pu_venda_manha"] == row["pu_venda_manha"] else None,
            "fonte": "tesouro_transparente",
        }
        model = MODELED.get(tipo)
        if model is not None and venc > last_db:
            rp = risk_profile(last_db, venc, taxa, model["with_coupons"], coupon_annual=model["coupon"])
            entry["modelado"] = True
            entry["termo"] = model["termo"]
            entry["duration_macaulay_anos"] = round(rp.macaulay_duration_years, 2)
            entry["modified_duration_anos"] = round(rp.modified_duration_years, 2)
            entry["dv01_brl"] = round(rp.dv01_brl, 4)
            entry["convexidade"] = round(rp.convexity, 1)
            entry["cenarios_mtm"] = mtm_scenarios(
                last_db, venc, taxa, model["with_coupons"], coupon_annual=model["coupon"]
            )
        else:
            entry["modelado"] = False
            entry["motivo_nao_modelado"] = NOT_MODELED_REASON.get(
                tipo, "tipo não reconhecido pelos modelos do MVP"
            )

        # série histórica DESTE título (tipo+vencimento) — nunca misturar
        hist = df[(df["tipo_titulo"] == tipo) & (df["dt_vencimento"] == venc)]
        series = list(zip(hist["data_base"], hist["taxa_compra_manha"].astype(float)))
        if len(series) >= 2:
            a = analyze(series, taxa)  # limite = taxa atual -> percentil e janela atual
            rates = [r for _, r in series]
            entry["historico"] = {
                "pregoes": a.total_sessions,
                "primeiro": a.first_date.isoformat(),
                "percentil_taxa_atual": round(_percentile_of(rates, taxa), 1),
                "maxima": a.max_rate, "minima": a.min_rate,
                "media": round(a.mean_rate, 2), "mediana": round(a.median_rate, 2),
            }
            if (model is not None and a.total_sessions >= MIN_SESSIONS_RADAR
                    and (venc - last_db).days >= MIN_DIAS_ATE_VENCIMENTO_RADAR):
                pct = _percentile_of(rates, taxa)
                if pct >= RADAR_PERCENTIL_ENTRADA:
                    sorted_rates = sorted(rates)
                    exit_rate = sorted_rates[int(len(sorted_rates) * RADAR_PERCENTIL_SAIDA / 100)]
                    janelas.append({
                        "tipo": tipo, "vencimento": venc.isoformat(),
                        "taxa_atual_pct": taxa,
                        "percentil": round(pct, 1),
                        "criterio": f"taxa atual >= percentil {RADAR_PERCENTIL_ENTRADA:.0f} da própria série ({a.total_sessions} pregões)",
                        "saida_hysteresis_pct": round(exit_rate, 2),
                        "invalidacao": f"taxa abaixo de {exit_rate:.2f}% (percentil {RADAR_PERCENTIL_SAIDA:.0f}) encerra a janela",
                        "nota": "taxa historicamente alta NÃO é recomendação; avalie objetivo, prazo e risco de marcação",
                        "confianca": "MEDIA",
                    })
        titulos.append(entry)

    def _curve(tipos: tuple[str, ...]) -> list[dict]:
        # mesmo filtro de prazo do radar: taxa cotada perto do vencimento distorce
        pts = [t for t in titulos if t["tipo"] in tipos
               and (date.fromisoformat(t["vencimento"]) - last_db).days >= MIN_DIAS_ATE_VENCIMENTO_RADAR]
        return sorted(
            [{"vencimento": t["vencimento"], "taxa_pct": t["taxa_compra_pct"], "tipo": t["tipo"]} for t in pts],
            key=lambda p: p["vencimento"],
        )

    payload = {
        "data_base": last_db.isoformat(),
        "fonte": "Tesouro Transparente (CSV oficial) — taxas ofertadas ao varejo; NÃO é curva indicativa ANBIMA",
        "titulos": titulos,
        "curvas": {
            "nominal_prefixado": _curve(("Tesouro Prefixado", "Tesouro Prefixado com Juros Semestrais")),
            "real_ipca": _curve(("Tesouro IPCA+", "Tesouro IPCA+ com Juros Semestrais")),
            "nota": "pontos por vencimento na última data-base; títulos com e sem cupom marcados — durations distintas; vencimentos < 1 ano excluídos (taxa de fim de prazo distorce)",
        },
        "radar_janelas": janelas,
        "parametros_radar": {
            "percentil_entrada": RADAR_PERCENTIL_ENTRADA,
            "percentil_saida_hysteresis": RADAR_PERCENTIL_SAIDA,
            "min_pregoes": MIN_SESSIONS_RADAR,
        },
        "historico_oficial_desde": df["data_base"].min().isoformat(),
    }
    out = config.GOLD_DIR / "tesouro_paineis.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return payload
