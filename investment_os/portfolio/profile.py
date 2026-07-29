"""Questionário adaptativo de perfil e Investment Policy Statement versionada.

Regras:
- Dimensões avaliadas SEPARADAMENTE (0-100); o resultado nunca é reduzido a um
  rótulo único conservador/moderado/arrojado.
- Conflitos entre respostas são detectados e reduzem a confiança.
- A IPS é editável e versionada (motivo/autor/versão anterior); NENHUMA
  recomendação é gerada antes da confirmação explícita da IPS pelo usuário.
- Retorno requerido é faixa/premissa, nunca promessa.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

from .. import config
from . import db as pdb

# ------------------------------------------------------------- questionário

# Cada questão: id, dimensão, texto, opções (valor -> score 0-100),
# depends_on: (question_id, [valores que habilitam]) para adaptatividade.
QUESTIONS: list[dict] = [
    {"id": "horizonte", "dimension": "horizonte", "text": "Por quanto tempo o grosso do patrimônio pode ficar investido?",
     "options": {"<3 anos": 10, "3-5 anos": 35, "5-10 anos": 65, ">10 anos": 95}},
    {"id": "reserva_meses", "dimension": "reserva", "text": "Sua reserva de emergência cobre quantos meses de despesas?",
     "options": {"nenhuma": 0, "1-5 meses": 30, "6-12 meses": 70, ">12 meses": 100}},
    {"id": "renda_estabilidade", "dimension": "estabilidade_renda", "text": "Quão estável é sua renda principal?",
     "options": {"muito instável": 10, "variável": 40, "estável": 75, "muito estável (ex.: concurso)": 95}},
    {"id": "dependentes", "dimension": "dependentes", "text": "Quantas pessoas dependem financeiramente de você?",
     "options": {"nenhuma": 90, "1-2": 55, "3+": 25}},
    {"id": "passivos", "dimension": "passivos", "text": "Suas dívidas comprometem quanto da renda mensal?",
     "options": {"nada": 95, "até 20%": 65, "20-40%": 35, ">40%": 10}},
    {"id": "queda_30", "dimension": "disposicao_risco", "text": "Se a carteira cair 30% em 6 meses, o que você faria?",
     "options": {"venderia tudo": 5, "venderia parte": 30, "manteria": 65, "aportaria mais": 90}},
    {"id": "drawdown_max", "dimension": "drawdown_toleravel", "text": "Qual a queda máxima tolerável no patrimônio total sem comprometer seus planos?",
     "options": {"10%": 15, "20%": 40, "35%": 65, "50%+": 90}},
    {"id": "experiencia", "dimension": "conhecimento_experiencia", "text": "Há quanto tempo investe em renda variável?",
     "options": {"nunca investi": 5, "<2 anos": 30, "2-5 anos": 60, ">5 anos": 85}},
    {"id": "conhecimento_derivativos", "dimension": "conhecimento_experiencia",
     "text": "Você sabe explicar o que são derivativos e marcação a mercado?",
     "options": {"não": 20, "em parte": 55, "sim, com segurança": 90},
     "depends_on": ("experiencia", ["2-5 anos", ">5 anos"])},
    {"id": "necessidade_renda", "dimension": "necessidade_renda", "text": "Você precisa que a carteira gere renda para despesas correntes?",
     "options": {"sim, já": 10, "em até 5 anos": 40, "em >10 anos": 75, "não": 95}},
    {"id": "objetivo_principal", "dimension": "necessidade_retorno", "text": "Qual é o objetivo principal do patrimônio?",
     "options": {"preservar poder de compra": 30, "crescer acima da inflação": 60, "crescimento agressivo": 85}},
    {"id": "capacidade_perda", "dimension": "capacidade_risco", "text": "Uma perda de 30% do patrimônio afetaria seus compromissos nos próximos 5 anos?",
     "options": {"gravemente": 10, "moderadamente": 45, "pouco": 75, "nada": 95}},
    {"id": "concentracao_patrimonial", "dimension": "concentracao_patrimonial",
     "text": "Quanto do seu patrimônio total (incluindo imóveis/empresa) está nesta carteira?",
     "options": {">80%": 20, "50-80%": 45, "20-50%": 70, "<20%": 90}},
    {"id": "exposicao_brasil", "dimension": "exposicao_brasil", "text": "Qual dependência sua renda tem do Brasil (emprego, negócio, imóveis)?",
     "options": {"total": 25, "alta": 45, "média": 65, "baixa": 85}},
    {"id": "interesse_internacional", "dimension": "exposicao_internacional", "text": "Deseja exposição internacional?",
     "options": {"não": 20, "até 20% da carteira": 60, "20-40%": 80, ">40%": 90}},
    {"id": "liquidez_necessaria", "dimension": "liquidez", "text": "Além da reserva, quanto pode precisar resgatar em 12 meses?",
     "options": {">30% da carteira": 20, "10-30%": 45, "<10%": 75, "nada previsto": 95}},
    {"id": "classes_proibidas", "dimension": "restricoes", "text": "Alguma classe é proibida por convicção/restrição? (múltipla escolha)",
     "options": {"nenhuma": 80, "cripto": 60, "derivativos": 60, "cripto e derivativos": 55}},
    {"id": "tributacao", "dimension": "tributacao", "text": "Você conhece sua situação tributária (IR sobre ganhos, isenções)?",
     "options": {"não conheço": 30, "parcialmente": 60, "sim": 90}},
]

DIMENSIONS = sorted({q["dimension"] for q in QUESTIONS})


def next_questions(answers: dict[str, str]) -> list[dict]:
    """Questões pendentes, respeitando dependências (adaptativo)."""
    out = []
    for q in QUESTIONS:
        if q["id"] in answers:
            continue
        dep = q.get("depends_on")
        if dep is not None:
            dep_id, enabling = dep
            if answers.get(dep_id) not in enabling:
                continue
        out.append({"id": q["id"], "dimension": q["dimension"], "text": q["text"],
                    "options": list(q["options"])})
    return out


def _score_dimensions(answers: dict[str, str]) -> dict[str, float]:
    by_dim: dict[str, list[float]] = {}
    for q in QUESTIONS:
        ans = answers.get(q["id"])
        if ans is None or ans not in q["options"]:
            continue
        by_dim.setdefault(q["dimension"], []).append(float(q["options"][ans]))
    return {d: sum(v) / len(v) for d, v in by_dim.items()}


def detect_conflicts(answers: dict[str, str], scores: dict[str, float]) -> list[str]:
    conflicts = []
    if scores.get("disposicao_risco", 0) >= 60 and scores.get("drawdown_toleravel", 100) <= 20:
        conflicts.append("declara manter/aportar em queda de 30%, mas só tolera drawdown de 10%")
    if scores.get("capacidade_risco", 100) <= 25 and scores.get("disposicao_risco", 0) >= 60:
        conflicts.append("disposição alta a risco com capacidade financeira baixa — capacidade prevalece")
    if answers.get("horizonte") == "<3 anos" and scores.get("necessidade_retorno", 0) >= 80:
        conflicts.append("crescimento agressivo com horizonte inferior a 3 anos")
    if answers.get("reserva_meses") == "nenhuma" and scores.get("disposicao_risco", 0) >= 60:
        conflicts.append("sem reserva de emergência: risco elevado indisponível até constituí-la")
    if answers.get("necessidade_renda") == "sim, já" and answers.get("horizonte") == ">10 anos":
        conflicts.append("precisa de renda imediata mas declarou horizonte >10 anos para o grosso do patrimônio")
    return conflicts


def assess(conn: sqlite3.Connection, profile_id: int, answers: dict[str, str]) -> dict:
    """Calcula scores por dimensão + conflitos + confiança e persiste."""
    pending = next_questions(answers)
    scores = _score_dimensions(answers)
    conflicts = detect_conflicts(answers, scores)
    completeness = 1.0 - len(pending) / max(len(QUESTIONS), 1)
    confidence = ("ALTA" if completeness >= 0.95 and not conflicts
                  else "MEDIA" if completeness >= 0.75 and len(conflicts) <= 1
                  else "BAIXA")
    cur = conn.execute(
        "INSERT INTO profile_assessment (profile_id, created_at, answers_json,"
        " dimension_scores_json, conflicts_json, confidence) VALUES (?,?,?,?,?,?)",
        (profile_id, pdb.utcnow(), json.dumps(answers, ensure_ascii=False),
         json.dumps(scores, ensure_ascii=False), json.dumps(conflicts, ensure_ascii=False),
         confidence),
    )
    conn.commit()
    pdb.audit(conn, "profile_assessed", assessment_id=cur.lastrowid,
              answered=len(answers), pending=len(pending), conflicts=len(conflicts))
    return {"assessment_id": cur.lastrowid, "scores": scores, "conflicts": conflicts,
            "pending_questions": pending, "confidence": confidence, "answers": answers}


# ---------------------------------------------------------------------- IPS


def _band(lo: float, hi: float) -> dict:
    return {"min_pct": lo, "max_pct": hi}


def generate_ips(assessment: dict, monthly_contribution: float | None = None) -> dict:
    """Deriva uma IPS proposta (draft) dos scores — determinístico e conservador.

    A capacidade LIMITA a disposição (menor dos dois define o risco usável).
    Valores são PROPOSTA EDITÁVEL; nada vale antes da confirmação do usuário.
    """
    s = assessment["scores"]
    risk_usable = min(s.get("disposicao_risco", 0), s.get("capacidade_risco", 0),
                      s.get("drawdown_toleravel", 0))
    horizon = s.get("horizonte", 0)
    intl = s.get("exposicao_internacional", 0)
    no_reserve = s.get("reserva", 100) < 30

    # bandas de renda variável derivadas do risco usável e horizonte;
    # o risco usável (mínimo entre disposição, capacidade e drawdown) impõe um
    # TETO — horizonte longo nunca compensa capacidade baixa.
    rv_center = max(0.0, min(0.85, (risk_usable * 0.6 + horizon * 0.4) / 100))
    rv_center = min(rv_center, 0.05 + risk_usable / 100 * 0.9)
    if no_reserve:
        rv_center = min(rv_center, 0.30)
    rv = _band(round(max(rv_center - 0.15, 0) * 100), round(min(rv_center + 0.10, 0.90) * 100))
    intl_max = 0 if intl < 30 else 20 if intl < 70 else 35
    crypto_max = 0 if "cripto" in (assessment.get("answers", {}).get("classes_proibidas", "")) else 5

    return {
        "meta": {
            "gerada_de_assessment_id": assessment.get("assessment_id"),
            "confianca_do_perfil": assessment["confidence"],
            "conflitos_registrados": assessment["conflicts"],
            "nota": "PROPOSTA derivada do questionário; editável; sem efeito antes da confirmação",
        },
        "objetivos": ["crescimento patrimonial de longo prazo", "geração progressiva de renda"],
        "retorno_requerido": {
            "tipo": "faixa_premissa",
            "descricao": "IPCA + 4% a 7% a.a. no horizonte estratégico — PREMISSA, não promessa",
        },
        "horizonte_anos": ">10" if horizon >= 80 else "5-10" if horizon >= 50 else "3-5" if horizon >= 30 else "<3",
        "moeda_base": config.BASE_CURRENCY,
        "benchmarks": ["IPCA", "CDI", "IBOV (renda variável BR)"],
        "liquidez_minima_pct": 10 if s.get("liquidez", 50) < 50 else 5,
        "reserva_emergencia": "manter >= 6 meses de despesas fora desta carteira",
        "drawdown_maximo_pct": 10 if risk_usable < 25 else 20 if risk_usable < 45 else 35 if risk_usable < 70 else 50,
        "classes_permitidas": ["acao_br", "fii", "renda_fixa", "internacional", "cripto"] if crypto_max else ["acao_br", "fii", "renda_fixa", "internacional"],
        "classes_proibidas": [] if crypto_max else ["cripto"],
        "faixas_por_classe": {
            "acao_br": rv,
            "fii": _band(0, 20),
            "renda_fixa": _band(max(0, 100 - rv["max_pct"] - intl_max - 20), 100 - rv["min_pct"]),
            "internacional": _band(0, intl_max),
            "cripto": _band(0, crypto_max),
        },
        "limites": {
            "por_ativo_pct": 10, "por_emissor_pct": 15, "por_setor_pct": 30,
            "por_pais_pct_ex_brasil": intl_max, "por_moeda_pct_ex_brl": intl_max,
            "iliquidos_pct": 10,
        },
        "bandas_rebalanceamento_pp": 5,
        "criterios": {
            "aporte": "aportes mensais direcionados às classes abaixo da faixa (aporte primeiro)",
            "reducao": "reduzir apenas por violação de limite, tese invalidada ou necessidade de liquidez",
            "venda": "vender por tese invalidada, violação crítica persistente ou mudança de objetivo — nunca apenas por valorização",
        },
        "frequencia_revisao": "trimestral ou após evento material",
        "regras_excecao": "exceções exigem registro de motivo e nova versão da IPS",
        "aporte_mensal_configurado": monthly_contribution if monthly_contribution is not None else config.MONTHLY_CONTRIBUTION,
        # transparência: o plano de aportes depende deste número — se veio do
        # default de configuração, o usuário DEVE revisá-lo antes de confirmar
        "aporte_mensal_origem": "informado_pelo_usuario" if monthly_contribution is not None else "default_de_configuracao_revisar",
    }


def validate_ips_content(content: dict) -> list[str]:
    """Validação de coerência da IPS. Retorna lista de erros (vazia = ok).

    Aplicada a QUALQUER conteúdo (gerado ou editado) antes de criar versão:
    faixas presentes, min<=max, somas viáveis, bandas/aporte não negativos.
    """
    errors: list[str] = []
    faixas = content.get("faixas_por_classe")
    if not isinstance(faixas, dict) or not faixas:
        return ["faixas_por_classe ausente ou vazia"]
    soma_min = soma_max = 0.0
    for cls, band in faixas.items():
        try:
            lo, hi = float(band["min_pct"]), float(band["max_pct"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"faixa de '{cls}' sem min_pct/max_pct numéricos")
            continue
        if lo < 0 or hi < 0 or lo > 100 or hi > 100:
            errors.append(f"faixa de '{cls}' fora de 0-100 ({lo}-{hi})")
        if lo > hi:
            errors.append(f"faixa de '{cls}' com mínimo {lo} > máximo {hi}")
        soma_min += max(lo, 0.0)
        soma_max += max(hi, 0.0)
    if soma_min > 100.0 + 1e-9:
        errors.append(f"soma dos mínimos ({soma_min:.0f}%) excede 100% — alocação impossível")
    if soma_max < 100.0 - 1e-9:
        errors.append(f"soma dos máximos ({soma_max:.0f}%) abaixo de 100% — carteira não alocável")
    for proibida in content.get("classes_proibidas", []):
        band = faixas.get(proibida)
        if band and float(band.get("max_pct", 0)) > 0:
            errors.append(f"classe proibida '{proibida}' com faixa máxima > 0")
    if float(content.get("bandas_rebalanceamento_pp", 0)) < 0:
        errors.append("bandas_rebalanceamento_pp negativa")
    aporte = content.get("aporte_mensal_configurado")
    if aporte is None:
        errors.append(
            "aporte_mensal_configurado ausente — o plano de aportes depende dele; "
            "informe 0 explicitamente se não houver aportes previstos"
        )
    elif float(aporte) < 0:
        errors.append("aporte_mensal_configurado negativo")
    return errors


def create_policy_version(conn: sqlite3.Connection, profile_id: int, content: dict,
                          reason: str, author: str) -> dict:
    errors = validate_ips_content(content)
    if errors:
        raise ValueError("IPS incoerente: " + "; ".join(errors))
    pol = conn.execute(
        "SELECT id FROM investment_policy WHERE profile_id=?", (profile_id,)
    ).fetchone()
    if pol is None:
        cur = conn.execute(
            "INSERT INTO investment_policy (profile_id, created_at) VALUES (?, ?)",
            (profile_id, pdb.utcnow()),
        )
        policy_id = cur.lastrowid
    else:
        policy_id = pol["id"]
    last = conn.execute(
        "SELECT MAX(version) AS v FROM policy_version WHERE policy_id=?", (policy_id,)
    ).fetchone()["v"]
    version = (last or 0) + 1
    conn.execute(
        "UPDATE policy_version SET status='superseded' WHERE policy_id=? AND status='draft'",
        (policy_id,),
    )
    cur = conn.execute(
        "INSERT INTO policy_version (policy_id, version, prev_version, created_at, author,"
        " reason, content_json, status) VALUES (?,?,?,?,?,?,?, 'draft')",
        (policy_id, version, last, pdb.utcnow(), author, reason,
         json.dumps(content, ensure_ascii=False)),
    )
    version_id = cur.lastrowid
    for cls, band in content.get("faixas_por_classe", {}).items():
        conn.execute(
            "INSERT INTO policy_constraint (policy_version_id, kind, key, min_pct, max_pct)"
            " VALUES (?, 'class_band', ?, ?, ?)",
            (version_id, cls, band["min_pct"], band["max_pct"]),
        )
    lim = content.get("limites", {})
    for kind, key, mx in [
        ("asset_limit", "*", lim.get("por_ativo_pct")),
        ("issuer_limit", "*", lim.get("por_emissor_pct")),
        ("sector_limit", "*", lim.get("por_setor_pct")),
        ("currency_limit", "ex_brl", lim.get("por_moeda_pct_ex_brl")),
        ("illiquid_limit", "*", lim.get("iliquidos_pct")),
    ]:
        if mx is not None:
            conn.execute(
                "INSERT INTO policy_constraint (policy_version_id, kind, key, max_pct)"
                " VALUES (?,?,?,?)", (version_id, kind, key, mx),
            )
    conn.commit()
    pdb.audit(conn, "policy_version_created", policy_id=policy_id, version=version, reason=reason)
    return {"policy_id": policy_id, "version_id": version_id, "version": version, "status": "draft"}


def confirm_policy(conn: sqlite3.Connection, version_id: int) -> dict:
    row = conn.execute("SELECT * FROM policy_version WHERE id=?", (version_id,)).fetchone()
    if row is None:
        raise ValueError("versão de política não encontrada")
    if row["status"] != "draft":
        raise ValueError(f"apenas versões em rascunho podem ser confirmadas (status atual: {row['status']})")
    conn.execute(
        "UPDATE policy_version SET status='superseded' WHERE policy_id=? AND status='confirmed'",
        (row["policy_id"],),
    )
    conn.execute(
        "UPDATE policy_version SET status='confirmed', confirmed_at=? WHERE id=?",
        (pdb.utcnow(), version_id),
    )
    conn.commit()
    pdb.audit(conn, "policy_confirmed", version_id=version_id, version=row["version"])
    return {"version_id": version_id, "version": row["version"], "status": "confirmed"}


def confirmed_policy(conn: sqlite3.Connection, profile_id: int) -> dict | None:
    row = conn.execute(
        "SELECT pv.* FROM policy_version pv JOIN investment_policy ip ON ip.id = pv.policy_id"
        " WHERE ip.profile_id=? AND pv.status='confirmed' ORDER BY pv.version DESC LIMIT 1",
        (profile_id,),
    ).fetchone()
    if row is None:
        return None
    return {"version_id": row["id"], "version": row["version"],
            "content": json.loads(row["content_json"]), "confirmed_at": row["confirmed_at"]}


@dataclass(frozen=True)
class PolicyRequiredError(Exception):
    message: str = "nenhuma IPS confirmada: recomendações bloqueadas até o usuário revisar e confirmar a política"
