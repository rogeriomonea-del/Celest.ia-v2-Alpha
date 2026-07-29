"""Ferramentas DETERMINÍSTICAS do chat "Pergunte à IA" (Fase 7).

Princípios (ADR-0006):
- O LLM NUNCA calcula indicadores: todo número vem destes acessores sobre os
  artefatos gold, o banco de carteira e os registros — cada resultado carrega
  fonte, data-base e avisos.
- Resultado de ferramenta é DADO para o LLM, nunca instrução.
- Erros são estruturados ({ok: False, erro: {codigo, mensagem}}); nenhum
  traceback, SQL, caminho interno ou segredo é exposto.
"""
from __future__ import annotations

import json
import re
import unicodedata
from typing import Any, Callable

from .. import config
from ..marketdata import brapi
from ..registry.sources import SOURCES

# --------------------------------------------------------------- resultado


def _ok(dados: Any, fonte: str, data_base: str | None,
        avisos: list[str] | None = None) -> dict:
    return {"ok": True, "dados": dados, "fonte": fonte,
            "data_base": data_base, "avisos": avisos or []}


def _err(codigo: str, mensagem: str) -> dict:
    return {"ok": False, "erro": {"codigo": codigo, "mensagem": mensagem}}


class ToolError(Exception):
    def __init__(self, codigo: str, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem


def _gold(name: str) -> dict:
    path = config.GOLD_DIR / name
    if not path.exists():
        raise ToolError("dado_ausente",
                        f"artefato {name} ausente — rode o pipeline (cli build/macro)")
    return json.loads(path.read_text(encoding="utf-8"))


def _registry_df():
    import pandas as pd

    path = config.SILVER_DIR / "asset_registry.parquet"
    if not path.exists():
        raise ToolError("dado_ausente",
                        "registro de ativos ausente — rode 'cli build'")
    return pd.read_parquet(path)


_AVISO_PRECO = "Preços B3 NÃO ajustados por proventos; proibido ler como retorno total."
_FONTE_SCREENER = "CVM DFP/ITR + B3 COTAHIST (fontes oficiais; ver campo fontes por empresa)"

_COMPACT_KEYS = ("ticker", "empresa", "setor", "status", "pl", "pvpa", "roe_ltm",
                 "roe_med5", "div_liq_ebitda", "cagr_receita", "conversao_caixa",
                 "criterios_reprovados", "preco_data", "ultima_demonstracao")


# ------------------------------------------------------------- ferramentas


def screen_market(status: str | None = None, limite: int = 20) -> dict:
    g = _gold("screener_quality_deep_value.json")
    empresas = g["empresas"]
    contagens: dict[str, int] = {}
    for e in empresas:
        contagens[e["status"]] = contagens.get(e["status"], 0) + 1
    if status:
        s = status.strip().upper()
        if s not in contagens and s not in ("APROVADA", "QUASE_APROVADA", "REPROVADA", "DADOS_INSUFICIENTES"):
            raise ToolError("status_invalido", f"status '{status}' inválido")
        empresas = [e for e in empresas if e["status"] == s]
    limite = max(1, min(int(limite), 50))
    return _ok(
        {
            "preset": g["preset"],
            "contagens": contagens,
            "empresas": [{k: e.get(k) for k in _COMPACT_KEYS} for e in empresas[:limite]],
            "truncado_em": limite if len(empresas) > limite else None,
            "pendencias_globais_do_preset": g.get("pendencias_globais_do_preset", []),
        },
        _FONTE_SCREENER, g["run_date"],
        [_AVISO_PRECO, "Aprovação no screener NÃO é recomendação de compra."],
    )


def _registry_row(ticker: str) -> dict | None:
    df = _registry_df()
    hit = df[df["ticker"] == ticker]
    if hit.empty:
        return None
    r = hit.iloc[0]
    close = r["ultimo_fechamento"]
    return {
        "ticker": r["ticker"], "tipo": r["tipo"],
        "classificacao_confianca": r["classificacao_confianca"],
        "cnpj_emissor": r["cnpj_emissor"] if isinstance(r["cnpj_emissor"], str) else None,
        "ultimo_pregao": str(r["ultimo_pregao"]),
        "ultimo_fechamento": float(close) if close == close else None,
    }


def _screener_entry(ticker: str) -> dict | None:
    g = _gold("screener_quality_deep_value.json")
    for e in g["empresas"]:
        if ticker in (e.get("ticker") or "").split(","):
            return e
    return None


def analyze_asset(ticker: str) -> dict:
    t = ticker.strip().upper()
    reg = _registry_row(t)
    fund = _screener_entry(t)
    if reg is None and fund is None:
        raise ToolError("ativo_nao_encontrado",
                        f"{t} não consta no registro B3 nem no universo do screener")
    avisos = [_AVISO_PRECO]
    if reg and reg["tipo"] != "acao_br":
        avisos.append(f"Tipo {reg['tipo']}: sem análise fundamentalista no MVP "
                      "(screener cobre companhias abertas CVM).")
    if fund is None:
        avisos.append("Sem demonstrações CVM vinculadas — apenas dados de pregão.")
    data_base = (fund or {}).get("preco_data") or (reg or {}).get("ultimo_pregao")
    return _ok({"registro_b3": reg, "fundamentos_screener": fund},
               _FONTE_SCREENER if fund else "B3 COTAHIST (oficial)", data_base, avisos)


def compare_assets(tickers: list[str]) -> dict:
    ts = [t.strip().upper() for t in tickers if t and t.strip()]
    if not 2 <= len(ts) <= 5:
        raise ToolError("parametro_invalido", "compare de 2 a 5 tickers")
    linhas, ausentes = [], []
    for t in ts:
        fund = _screener_entry(t)
        reg = _registry_row(t)
        if fund is None and reg is None:
            ausentes.append(t)
            continue
        linha = {k: (fund or {}).get(k) for k in _COMPACT_KEYS}
        linha["ticker"] = t
        linha["tipo"] = (reg or {}).get("tipo")
        linha["ultimo_fechamento"] = (reg or {}).get("ultimo_fechamento")
        linhas.append(linha)
    if not linhas:
        raise ToolError("ativo_nao_encontrado", f"nenhum dos tickers encontrado: {ts}")
    g = _gold("screener_quality_deep_value.json")
    return _ok({"comparacao": linhas, "ausentes": ausentes},
               _FONTE_SCREENER, g["run_date"],
               [_AVISO_PRECO, "Comparação válida apenas entre empresas do mesmo setor/modelo — "
                "múltiplos entre setores distintos não são comparáveis diretamente."])


def _db_conn():
    from ..portfolio import db as pdb

    return pdb.connect()


def _latest_snapshot_id(conn) -> int | None:
    row = conn.execute("SELECT id FROM portfolio_snapshot ORDER BY id DESC LIMIT 1").fetchone()
    return row["id"] if row is not None else None


def analyze_portfolio() -> dict:
    from ..portfolio import profile as prof
    from ..portfolio.analysis import analyze_snapshot

    conn = _db_conn()
    try:
        sid = _latest_snapshot_id(conn)
        if sid is None:
            raise ToolError("sem_carteira",
                            "nenhuma carteira importada — importe o arquivo da B3 em /importacao")
        policy = None
        if conn.execute("SELECT 1 FROM investor_profile WHERE id=1").fetchone():
            policy = prof.confirmed_policy(conn, 1)
        res = analyze_snapshot(conn, sid, policy["content"] if policy else None)
        avisos = [_AVISO_PRECO]
        if policy is None:
            avisos.append("Sem IPS confirmada: análise sem verificação de política.")
        return _ok(res, "carteira importada pelo usuário + B3 COTAHIST (oficial)",
                   res.get("data_base_precos") or res.get("data_base"), avisos)
    finally:
        conn.close()


def propose_rebalance(months: int = 6) -> dict:
    from ..portfolio.profile import PolicyRequiredError
    from ..portfolio.rebalance import build_plan

    conn = _db_conn()
    try:
        sid = _latest_snapshot_id(conn)
        if sid is None:
            raise ToolError("sem_carteira",
                            "nenhuma carteira importada — importe o arquivo da B3 em /importacao")
        try:
            plan = build_plan(conn, 1, sid, months=max(1, min(int(months), 24)))
        except PolicyRequiredError as exc:
            raise ToolError("politica_nao_confirmada", exc.message)
        return _ok(plan, "IPS confirmada + carteira importada + B3 COTAHIST (oficial)",
                   plan.get("data_base"),
                   ["Plano aporte-first; NÃO é ordem de execução. Custos/impostos "
                    "desconhecidos nunca são estimados como zero."])
    finally:
        conn.close()


def analyze_tesouro_window(tipo: str | None = None) -> dict:
    g = _gold("tesouro_paineis.json")
    janelas = g["radar_janelas"]
    if tipo:
        alvo = tipo.strip().lower()
        janelas = [j for j in janelas if alvo in j["tipo"].lower()]
    titulos = [
        {k: t.get(k) for k in ("tipo", "vencimento", "taxa_compra_pct", "modelado",
                               "duration_macaulay_anos", "dv01_brl")}
        for t in g["titulos"]
        if not tipo or tipo.strip().lower() in t["tipo"].lower()
    ]
    return _ok(
        {"radar_janelas": janelas, "parametros_radar": g["parametros_radar"],
         "titulos_resumo": titulos, "historico_oficial_desde": g["historico_oficial_desde"]},
        g["fonte"], g["data_base"],
        ["Percentil alto indica taxa historicamente elevada, NÃO previsão de queda.",
         "Taxas do varejo (Tesouro Direto); não é curva ANBIMA."],
    )


def analyze_macro_regime() -> dict:
    g = _gold("macro_regimes.json")
    return _ok(
        {"regimes": g["regimes"], "premissas": g["premissas"],
         "fora_do_escopo": g.get("fora_do_escopo_desta_fase", [])},
        "BCB SGS + Focus (oficiais; ver campo fonte por regime)", g["data_geracao"],
        ["Regimes são leitura de estado, não previsão.",
         "Focus é EXPECTATIVA DE MERCADO, não fato realizado."],
    )


# --------------------------------------------------- explicação de métricas


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9]", "", s)


def _metric_table() -> dict[str, dict]:
    """Parseia docs/METRIC_REGISTRY.md (fonte única de metodologia)."""
    path = config.REPO_ROOT / "docs" / "METRIC_REGISTRY.md"
    if not path.exists():
        raise ToolError("dado_ausente", "docs/METRIC_REGISTRY.md ausente")
    secao = ""
    out: dict[str, dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            secao = line[3:].strip()
        elif line.startswith("|") and not line.startswith("|---") and "Métrica" not in line:
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) >= 3 and cells[0]:
                out[_norm(cells[0])] = {"metrica": cells[0], "formula": cells[1],
                                        "regras": cells[2], "secao": secao}
    return out


_ALIASES = {"pl": "pl", "precolucro": "pl", "pvp": "pvpa", "duration": "durationmacaulay",
            "dividaebitda": "dividaliquidaebitda", "cagr": "cagrreceitalucrofcf",
            "roe": "roeltm", "fcf": "fcfproxy", "dy": "dividendyield"}


def explain_metric(metrica: str) -> dict:
    table = _metric_table()
    key = _norm(metrica)
    key = _ALIASES.get(key, key)
    hit = table.get(key)
    if hit is None:
        matches = [v for k, v in table.items() if key and key in k]
        if len(matches) == 1:
            hit = matches[0]
        elif matches:
            raise ToolError("ambiguo",
                            f"'{metrica}' ambíguo; candidatos: {[m['metrica'] for m in matches]}")
    if hit is None:
        raise ToolError("metrica_desconhecida",
                        f"'{metrica}' não consta no METRIC_REGISTRY; disponíveis: "
                        f"{sorted(v['metrica'] for v in table.values())}")
    return _ok(hit, "docs/METRIC_REGISTRY.md (metodologia oficial do sistema)", None,
               ["Estados de indisponibilidade nunca viram 0: "
                "OK|NAO_APLICAVEL|PREJUIZO|TURNAROUND|DADO_INSUFICIENTE|SERIE_NAO_COMPARAVEL|INDISPONIVEL"])


def retrieve_source(source_id: str | None = None) -> dict:
    def _dump(s) -> dict:
        return {"source_id": s.source_id, "orgao": s.orgao, "tipo_dado": s.tipo_dado,
                "base_url": s.base_url, "licenca": s.licenca, "frequencia": s.frequencia,
                "limitacoes": s.limitacoes}

    if source_id:
        s = SOURCES.get(source_id.strip())
        if s is None:
            raise ToolError("fonte_desconhecida",
                            f"'{source_id}' não registrada; disponíveis: {sorted(SOURCES)}")
        dados: Any = _dump(s)
    else:
        dados = [_dump(s) for s in SOURCES.values()]
    return _ok(dados, "investment_os/registry/sources.py (espelho de docs/SOURCE_REGISTRY.md)",
               None, ["Hierarquia: 1) primária oficial; 2) institucional rotulada; "
                      "3) agregadores PROIBIDOS como fonte primária."])


def get_intraday_quote(ticker: str) -> dict:
    t = ticker.strip().upper()
    reg = _registry_row(t)
    if reg is None:
        raise ToolError("ativo_nao_encontrado", f"{t} não consta no registro B3")
    try:
        quote = brapi.get_quote(t)
    except brapi.BrapiUnavailableError:
        raise ToolError("intradiario_indisponivel",
                        f"cotação intradiária indisponível; oficial D-1 ({reg['ultimo_pregao']}): "
                        f"fechamento {reg['ultimo_fechamento']}")
    return _ok({"intradiario": quote, "oficial_d1": reg}, brapi.FONTE, quote.get("data_hora"),
               [brapi.AVISO, "Nunca usar este valor em cálculo de indicador."])


def _crit_list(v) -> list[str]:
    """Critérios do gold chegam como string '; '-separada (screener/run.py);
    aceita também lista (fixtures antigas). Nunca iterar string por caractere."""
    if isinstance(v, str):
        return [c.strip() for c in v.split(";") if c.strip()]
    return [str(c).strip() for c in (v or []) if str(c).strip()]


# Natureza da taxa por tipo de título: taxas REAIS e NOMINAIS não são
# comparáveis entre si — cada linha de custo de oportunidade é rotulada.
_NATUREZA_TAXA = (
    ("ipca", "REAL a.a. (acima do IPCA)"),
    ("igp", "REAL a.a. (acima do IGP-M)"),
    ("prefixado", "NOMINAL a.a."),
    ("selic", "PÓS-FIXADA (% a.a. atrelada à Selic)"),
)


def _natureza_taxa(tipo: str) -> str:
    t = tipo.lower()
    for chave, rotulo in _NATUREZA_TAXA:
        if chave in t:
            return rotulo
    return "natureza não classificada"


_CHECKLIST_RED_TEAM = [
    "O lucro LTM é sustentável ou há itens não recorrentes?",
    "A conversão de caixa acompanha o lucro contábil?",
    "O múltiplo baixo é desconto real ou value trap (setor/ciclo/governança)?",
    "Qual o impacto de Selic alta prolongada na tese e no custo de oportunidade vs Tesouro IPCA+?",
    "Concentração: quanto a posição adicionaria ao risco por emissor/setor da carteira?",
    "O que invalidaria a tese (gatilhos objetivos e verificáveis)?",
]


def challenge_thesis(ticker: str) -> dict:
    t = ticker.strip().upper()
    fund = _screener_entry(t)
    reg = _registry_row(t)
    if fund is None and reg is None:
        raise ToolError("ativo_nao_encontrado", f"{t} não consta na base")
    contrarias: list[str] = []
    if fund:
        for c in _crit_list(fund.get("criterios_reprovados")):
            contrarias.append(f"Critério do screener REPROVADO: {c}")
        for c in _crit_list(fund.get("criterios_nao_avaliados")):
            contrarias.append(f"Critério NÃO AVALIÁVEL (dado ausente — não presuma aprovação): {c}")
        if fund.get("status") == "APROVADA" and not contrarias:
            contrarias.append("Nenhum critério reprovado no preset atual — risco de viés de "
                              "confirmação; verifique dimensões fora do preset (governança, ciclo).")
    else:
        contrarias.append("Sem fundamentos CVM na base — tese não verificável pelo sistema.")
    macro = _gold("macro_regimes.json")
    for r in macro["regimes"]:
        contrarias.append(f"Regime macro ({r['dimensao']}): {r['estado']} — {r['detalhe']}")
    tes = _gold("tesouro_paineis.json")
    radar = tes["radar_janelas"]
    # melhor janela POR TIPO, cada uma rotulada pela natureza da taxa — taxa
    # real (IPCA+) e nominal (prefixado) nunca são fundidas num único "melhor".
    melhor_por_tipo: dict[str, dict] = {}
    for j in radar:
        atual = melhor_por_tipo.get(j["tipo"])
        if atual is None or (j.get("taxa_atual_pct") or 0) > (atual.get("taxa_atual_pct") or 0):
            melhor_por_tipo[j["tipo"]] = j
    for tipo, j in sorted(melhor_por_tipo.items()):
        contrarias.append(
            f"Custo de oportunidade em {tipo} {j['vencimento']}: taxa "
            f"{_natureza_taxa(tipo)} de {j['taxa_atual_pct']}% (percentil "
            f"{j['percentil']} da própria série) na data-base {tes['data_base']}.")
    if melhor_por_tipo:
        contrarias.append(
            "Atenção: taxas REAIS (IPCA+/IGP-M+) e NOMINAIS (prefixado) não são "
            "comparáveis diretamente entre si nem com retornos nominais de ações.")
    return _ok(
        {"ticker": t, "evidencias_contrarias": contrarias, "checklist_red_team": _CHECKLIST_RED_TEAM},
        "screener (CVM/B3) + macro (BCB) + Tesouro Transparente — evidências determinísticas",
        (fund or {}).get("preco_data") or tes["data_base"],
        ["Contra-argumento determinístico NÃO substitui o red-team; recomendação "
         "positiva exige thesis-red-team-agent + qa-evidence-auditor."],
    )


# ----------------------------------------------------- registro p/ o LLM


_REGISTRY: dict[str, Callable[..., dict]] = {
    "screen_market": screen_market,
    "analyze_asset": analyze_asset,
    "compare_assets": compare_assets,
    "analyze_portfolio": analyze_portfolio,
    "propose_rebalance": propose_rebalance,
    "analyze_tesouro_window": analyze_tesouro_window,
    "analyze_macro_regime": analyze_macro_regime,
    "explain_metric": explain_metric,
    "retrieve_source": retrieve_source,
    "get_intraday_quote": get_intraday_quote,
    "challenge_thesis": challenge_thesis,
}

TOOL_DEFINITIONS: list[dict] = [
    {"name": "screen_market",
     "description": "Screener quality+deep value sobre TODAS as companhias abertas CVM com "
                    "dados suficientes. Filtro opcional por status.",
     "input_schema": {"type": "object", "properties": {
         "status": {"type": "string", "enum": ["APROVADA", "QUASE_APROVADA", "REPROVADA", "DADOS_INSUFICIENTES"]},
         "limite": {"type": "integer", "minimum": 1, "maximum": 50}}, "required": []}},
    {"name": "analyze_asset",
     "description": "Ficha de um ativo B3: registro (tipo/último pregão) + fundamentos do "
                    "screener quando houver demonstrações CVM.",
     "input_schema": {"type": "object", "properties": {"ticker": {"type": "string"}},
                      "required": ["ticker"]}},
    {"name": "compare_assets",
     "description": "Compara 2 a 5 ativos lado a lado (múltiplos, ROE, alavancagem, status).",
     "input_schema": {"type": "object", "properties": {
         "tickers": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 5}},
         "required": ["tickers"]}},
    {"name": "analyze_portfolio",
     "description": "Análise da carteira importada mais recente do usuário (alocação, "
                    "concentração, conformidade com a IPS quando confirmada).",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "propose_rebalance",
     "description": "Plano de rebalanceamento aporte-first (exige IPS confirmada).",
     "input_schema": {"type": "object", "properties": {
         "months": {"type": "integer", "minimum": 1, "maximum": 24}}, "required": []}},
    {"name": "analyze_tesouro_window",
     "description": "Radar de janelas de taxa do Tesouro Direto (percentis históricos, "
                    "hysteresis) e resumo de títulos; filtro opcional por tipo.",
     "input_schema": {"type": "object", "properties": {"tipo": {"type": "string"}}, "required": []}},
    {"name": "analyze_macro_regime",
     "description": "Regimes macro atuais (inflação, política monetária, atividade, câmbio, "
                    "fiscal, expectativas) com fonte BCB e natureza FATO/EXPECTATIVA.",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "explain_metric",
     "description": "Fórmula e regras oficiais de uma métrica do METRIC_REGISTRY (P/L, ROE, "
                    "CAGR, duration...).",
     "input_schema": {"type": "object", "properties": {"metrica": {"type": "string"}},
                      "required": ["metrica"]}},
    {"name": "retrieve_source",
     "description": "Registro de fontes oficiais (órgão, URL, licença, frequência, limitações).",
     "input_schema": {"type": "object", "properties": {"source_id": {"type": "string"}},
                      "required": []}},
    {"name": "get_intraday_quote",
     "description": "Cotação intradiária INDICATIVA via agregador autorizado (brapi.dev) + "
                    "fechamento oficial D-1. Nunca usar em cálculos.",
     "input_schema": {"type": "object", "properties": {"ticker": {"type": "string"}},
                      "required": ["ticker"]}},
    {"name": "challenge_thesis",
     "description": "Evidências contrárias determinísticas a uma tese (critérios reprovados, "
                    "regimes macro, custo de oportunidade no Tesouro) + checklist red-team.",
     "input_schema": {"type": "object", "properties": {"ticker": {"type": "string"}},
                      "required": ["ticker"]}},
]


def run_tool(name: str, args: dict | None) -> dict:
    fn = _REGISTRY.get(name)
    if fn is None:
        return _err("ferramenta_desconhecida", f"ferramenta '{name}' não registrada")
    try:
        return fn(**(args or {}))
    except ToolError as exc:
        return _err(exc.codigo, exc.mensagem)
    except TypeError:
        return _err("parametro_invalido", f"parâmetros inválidos para '{name}'")
    except Exception:
        # nunca vazar traceback/SQL/caminhos para o LLM ou para o usuário
        return _err("erro_interno", f"falha interna ao executar '{name}'")
