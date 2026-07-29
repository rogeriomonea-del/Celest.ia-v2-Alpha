"""Motor de rebalanceamento "aporte primeiro" — determinístico.

Ordem de decisão (docs/METRIC_REGISTRY e briefing):
1. violações críticas; 2. reserva/liquidez; 3. novos aportes; 4. proventos
(sem dados no MVP — premissa declarada); 5. vencimentos (idem); 6. reduções
somente quando aportes não resolvem em prazo razoável; 7. custos/tributos
(imposto NUNCA estimado com custo desconhecido); 8. evitar giro.

Pré-condição dura: IPS CONFIRMADA. Sem ela, nenhum plano é gerado.
"""
from __future__ import annotations

import json
import sqlite3

from . import db as pdb
from .analysis import analyze_snapshot
from .profile import PolicyRequiredError, confirmed_policy

ALLOWED_ACTIONS = {
    "manter", "aumentar_com_aportes", "acumular_gradualmente", "nao_aumentar",
    "reduzir", "revisar_tese", "vender_por_tese_invalidada", "dados_insuficientes",
}
DILUTION_MONTHS_LIMIT = 12  # acima disso, diluição por aporte não basta -> reduzir


def _months_to_dilute(value: float, total: float, target_max_pct: float, monthly: float) -> float:
    """Meses de aporte (sem comprar a classe) até o peso cair ao teto da faixa.

    PREMISSA declarada: preços estáticos — é um horizonte de planejamento, não
    uma previsão.
    """
    if monthly <= 0:
        return float("inf")
    target = target_max_pct / 100.0
    if target <= 0:
        return float("inf")
    needed_total = value / target
    return max(0.0, (needed_total - total) / monthly)


def build_plan(conn: sqlite3.Connection, profile_id: int, snapshot_id: int,
               months: int = 6) -> dict:
    policy = confirmed_policy(conn, profile_id)
    if policy is None:
        raise PolicyRequiredError()
    content = policy["content"]
    monthly = float(content.get("aporte_mensal_configurado") or 0.0)
    analysis = analyze_snapshot(conn, snapshot_id, content)

    total = analysis["patrimonio_precificado_brl"]
    class_weights: dict[str, float] = dict(analysis["pesos"]["por_classe"])
    bands: dict[str, dict] = content.get("faixas_por_classe", {})
    banda_pp = float(content.get("bandas_rebalanceamento_pp", 5))

    critical = [v for v in analysis["violacoes"] if v["severidade"] == "critica"]
    actions: list[dict] = []
    sales_avoided_brl = 0.0
    seq = 1

    # posições sem preço/resolução: nunca recomendação de compra/venda
    for tkr in analysis["qualidade_dados"]["sem_preco"]:
        actions.append({
            "seq": seq, "scope": "asset", "key": tkr, "action": "dados_insuficientes",
            "priority": 0, "amount_brl": None,
            "rationale": "sem preço oficial ingerido: nenhuma recomendação de compra ou venda com dados de baixa confiança",
            "revisao": "reavaliar quando a série de preços do ativo for ingerida",
        })
        seq += 1

    # Violações críticas POR ATIVO/EMISSOR e de classe proibida: sempre geram
    # ação explícita (nunca desaparecem do plano). Ativo acima do limite não
    # recebe aporte; a diluição vem do crescimento do restante da carteira.
    handled_violations: list[dict] = []
    for v in critical:
        if v["tipo"] in ("asset_limit", "issuer_limit"):
            actions.append({
                "seq": seq, "scope": "asset", "key": v["chave"],
                "action": "nao_aumentar", "priority": 1, "amount_brl": None,
                "current_pct": v["peso_pct"], "target_max_pct": v["limite_pct"],
                "rationale": f"violação crítica do limite por {'ativo' if v['tipo'] == 'asset_limit' else 'emissor'} "
                             f"({v['peso_pct']:.1f}% vs {v['limite_pct']}%): não aumentar; diluição via "
                             "aportes no restante da carteira; reduzir se persistir após 12 meses",
                "revisao": "reavaliar a cada aporte",
            })
            handled_violations.append(v)
            seq += 1
        elif v["tipo"] == "classe_proibida":
            actions.append({
                "seq": seq, "scope": "class", "key": v["chave"],
                "action": "reduzir", "priority": 1,
                "amount_brl": round(v["peso_pct"] / 100.0 * total, 2),
                "current_pct": v["peso_pct"], "target_max_pct": 0,
                "rationale": f"classe proibida pela IPS em carteira ({v['peso_pct']:.1f}%): "
                             "eliminar a posição de forma ordenada",
                "custo_imposto": "imposto não estimado quando houver custo desconhecido nas posições da classe",
                "revisao": "confirmar eliminação no próximo snapshot",
            })
            handled_violations.append(v)
            seq += 1

    # Decisões sobre violações críticas de BANDA DE CLASSE antes da simulação
    # (dependem só dos totais): classes cuja violação não se resolve com o 1º
    # aporte ficam excluídas de novos aportes até voltarem à faixa.
    no_contrib_classes: set[str] = set()
    critical_decisions: list[dict] = []
    for v in critical:
        if v["tipo"] != "class_band":
            continue
        cls = v["chave"]
        value_cls = v["peso_pct"] / 100.0 * total
        band = v["faixa"]
        naive_sale = max(value_cls - band["max_pct"] / 100.0 * total, 0.0)
        weight_after_1m = value_cls / (total + monthly) * 100 if (total + monthly) > 0 else v["peso_pct"]
        m = _months_to_dilute(value_cls, total, band["max_pct"], monthly)
        decision = {"cls": cls, "band": band, "peso": v["peso_pct"],
                    "naive_sale": naive_sale, "months": m, "after_1m": weight_after_1m}
        if weight_after_1m <= band["max_pct"]:
            decision["kind"] = "resolvida_pelo_aporte"
        elif m <= DILUTION_MONTHS_LIMIT:
            decision["kind"] = "diluir"
            no_contrib_classes.add(cls)
        else:
            decision["kind"] = "reduzir"
            no_contrib_classes.add(cls)
        critical_decisions.append(decision)

    # 3. aportes: destino = classes abaixo da faixa (déficit até o mínimo primeiro,
    # depois até o centro), nunca classes acima do teto/excluídas/proibidas
    def _alloc_one_month(weights: dict[str, float], total_now: float) -> dict[str, float]:
        deficits_min: dict[str, float] = {}
        deficits_center: dict[str, float] = {}
        for cls, band in bands.items():
            w = weights.get(cls, 0.0)
            if band["max_pct"] <= 0 or (cls in no_contrib_classes and w > band["max_pct"]):
                continue
            value_now = w / 100 * total_now
            min_target = band["min_pct"] / 100 * (total_now + monthly)
            center_target = (band["min_pct"] + band["max_pct"]) / 2 / 100 * (total_now + monthly)
            if value_now < min_target:
                deficits_min[cls] = min_target - value_now
            elif value_now < center_target and weights.get(cls, 0.0) <= band["max_pct"]:
                deficits_center[cls] = center_target - value_now
        alloc: dict[str, float] = {}
        remaining = monthly
        for deficits in (deficits_min, deficits_center):
            if remaining <= 0 or not deficits:
                continue
            total_deficit = sum(deficits.values())
            for cls, d in deficits.items():
                take = min(d / total_deficit * remaining, d)
                alloc[cls] = round(alloc.get(cls, 0.0) + take, 2)
            remaining = monthly - sum(alloc.values())
        if remaining > 1e-6:
            # sem déficit: distribuir proporcional aos centros das faixas
            # permitidas, excluindo QUALQUER classe já acima do próprio teto
            centers = {
                c: (b["min_pct"] + b["max_pct"]) / 2
                for c, b in bands.items()
                if b["max_pct"] > 0 and weights.get(c, 0.0) <= b["max_pct"]
            }
            s = sum(centers.values()) or 1.0
            for cls, c in centers.items():
                alloc[cls] = round(alloc.get(cls, 0.0) + remaining * c / s, 2)
        return alloc

    # simulação determinística mês a mês (PREMISSA: preços estáticos)
    sim_weights = dict(class_weights)
    sim_total = total
    monthly_allocations: list[dict] = []
    for _m in range(1, months + 1):
        alloc = _alloc_one_month(sim_weights, sim_total)
        monthly_allocations.append(alloc)
        new_total = sim_total + monthly
        for cls in set(sim_weights) | set(alloc):
            value_cls = sim_weights.get(cls, 0.0) / 100 * sim_total + alloc.get(cls, 0.0)
            sim_weights[cls] = value_cls / new_total * 100
        sim_total = new_total

    # 1-2. violações críticas de banda de classe, DEPOIS de conhecer a alocação
    # do 1º aporte — as ações precisam ser coerentes com ela: se o próprio
    # aporte já dilui a classe para dentro da faixa, a violação se resolve sem
    # ação de venda; se não, "não aumentar" (diluição em N meses) ou "reduzir".
    for d in critical_decisions:
        cls, band = d["cls"], d["band"]
        base = {"scope": "class", "key": cls, "current_pct": d["peso"],
                "target_min_pct": band["min_pct"], "target_max_pct": band["max_pct"]}
        if d["kind"] == "resolvida_pelo_aporte":
            sales_avoided_brl += d["naive_sale"]
            actions.append({**base, "seq": seq, "action": "manter", "priority": 1,
                "amount_brl": None,
                "rationale": f"violação crítica resolvida pelo próprio 1º aporte "
                             f"(peso projetado {d['after_1m']:.1f}% <= teto {band['max_pct']}%); "
                             f"venda de R$ {d['naive_sale']:,.0f} evitada",
                "revisao": "confirmar no próximo aporte com preços atualizados"})
        elif d["kind"] == "diluir":
            sales_avoided_brl += d["naive_sale"]
            actions.append({**base, "seq": seq, "action": "nao_aumentar", "priority": 1,
                "amount_brl": None,
                "rationale": f"violação crítica diluível por aportes em ~{d['months']:.0f} meses "
                             f"(premissa: preços estáticos); venda de R$ {d['naive_sale']:,.0f} evitada",
                "revisao": "se em 12 meses o peso não voltar à faixa, reduzir ativamente"})
        else:
            actions.append({**base, "seq": seq, "action": "reduzir", "priority": 1,
                "amount_brl": round(d["naive_sale"], 2),
                "rationale": f"violação crítica não diluível por aportes em {DILUTION_MONTHS_LIMIT} meses "
                             f"(precisaria ~{d['months']:.0f}); redução até o teto da faixa",
                "custo_imposto": "imposto não estimado quando houver custo desconhecido nas posições da classe",
                "revisao": "reavaliar a cada aporte"})
        seq += 1

    # classes sem nenhum ativo ingerido/rastreável (ex.: internacional, cripto
    # antes das fases 6+): o aporte é recomendado, mas a execução e o
    # acompanhamento são externos ao sistema — declarado na ação
    tracked_classes = {p["asset_class"] for p in analysis["posicoes"]} | {"acao_br", "fii", "renda_fixa"}
    for cls, amount in monthly_allocations[0].items():
        band = bands.get(cls, {})
        rationale = "classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro"
        if cls not in tracked_classes:
            rationale += (" | ATENÇÃO: classe ainda sem ativos ingeridos no sistema — execução e "
                          "acompanhamento externos até a integração (fases 6+)")
        actions.append({
            "seq": seq, "scope": "class", "key": cls, "action": "aumentar_com_aportes",
            "priority": 2, "amount_brl": amount,
            "current_pct": round(class_weights.get(cls, 0.0), 2),
            "target_min_pct": band.get("min_pct"), "target_max_pct": band.get("max_pct"),
            "rationale": rationale,
            "revisao": "recalcular a cada aporte com preços atualizados",
        })
        seq += 1

    in_band_after = all(
        bands[c]["min_pct"] - banda_pp <= sim_weights.get(c, 0.0) <= bands[c]["max_pct"] + banda_pp
        for c in bands if bands[c]["max_pct"] > 0
    )

    plan = {
        "snapshot_id": snapshot_id, "policy_version": policy["version"],
        "aporte_mensal_brl": monthly,
        "premissas": [
            "preços estáticos durante a simulação (horizonte de planejamento, não previsão)",
            "sem dados de proventos e vencimentos ingeridos (fases futuras) — não considerados",
            "imposto não estimado onde o custo de aquisição é desconhecido",
        ] + ([
            f"ATENÇÃO: aporte mensal de R$ {monthly:,.0f} veio do DEFAULT de configuração, "
            "não de valor informado pelo usuário — todo o plano depende dele; revise a IPS"
        ] if content.get("aporte_mensal_origem") == "default_de_configuracao_revisar" else []),
        "proximo_aporte": monthly_allocations[0],
        "plano_3_meses": monthly_allocations[:3],
        "plano_6_meses": monthly_allocations[:months],
        "caminho_ate_faixas": {
            "dentro_das_faixas_apos_simulacao": in_band_after,
            "pesos_projetados_pct": {k: round(v, 2) for k, v in sim_weights.items()},
        },
        "vendas_evitadas_brl": round(sales_avoided_brl, 2),
        "concentracao_antes": analysis["concentracao"],
        "exposicao_cambial_antes": analysis["pesos"]["por_moeda"],
        "exposicao_cambial_depois": "inalterada pela simulação (aportes em BRL; classes internacionais pendentes de ingestão)",
        # toda ação de prioridade 1 endereça uma violação crítica, inclusive
        # 'manter' quando o próprio aporte resolve a diluição
        "violacoes_criticas_enderecadas": sum(1 for a in actions if a["priority"] == 1),
        # TODAS as violações não endereçadas por ação aparecem aqui — nenhuma
        # violação crítica pode desaparecer silenciosamente do plano
        "violacoes_remanescentes": [
            v for v in analysis["violacoes"]
            if v["severidade"] != "critica"
            or (v not in handled_violations and not any(
                d["cls"] == v.get("chave") for d in critical_decisions))
        ],
        "acoes": actions,
        "confianca": analysis["confianca"],
        "qualidade_dados": analysis["qualidade_dados"],
    }
    assert all(a["action"] in ALLOWED_ACTIONS for a in actions)

    cur = conn.execute(
        "INSERT INTO rebalance_plan (snapshot_id, policy_version_id, created_at, params_json,"
        " plan_json, confidence) VALUES (?,?,?,?,?,?)",
        (snapshot_id, policy["version_id"], pdb.utcnow(),
         json.dumps({"months": months, "monthly": monthly}),
         json.dumps(plan, ensure_ascii=False, default=str), plan["confianca"]),
    )
    plan_id = cur.lastrowid
    for a in actions:
        conn.execute(
            "INSERT INTO rebalance_action (plan_id, seq, scope, key, current_pct,"
            " target_min_pct, target_max_pct, action, amount_brl, priority, rationale)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (plan_id, a["seq"], a["scope"], a["key"], a.get("current_pct"),
             a.get("target_min_pct"), a.get("target_max_pct"), a["action"],
             a.get("amount_brl"), a["priority"], a["rationale"]),
        )
    for i, alloc in enumerate(monthly_allocations, start=1):
        conn.execute(
            "INSERT INTO contribution_plan (plan_id, month_offset, allocations_json) VALUES (?,?,?)",
            (plan_id, i, json.dumps(alloc)),
        )
    conn.commit()
    pdb.audit(conn, "rebalance_plan_created", plan_id=plan_id, snapshot_id=snapshot_id,
              actions=len(actions), sales_avoided_brl=plan["vendas_evitadas_brl"])
    plan["plan_id"] = plan_id
    return plan
