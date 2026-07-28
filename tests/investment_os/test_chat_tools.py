"""Ferramentas determinísticas do chat (Fase 7) — testes herméticos.

Gold/registro/DB sintéticos em tmp_path; brapi sempre monkeypatchado."""
import datetime as dt
import json

import pandas as pd
import pytest

from investment_os.chat import tools
from investment_os.marketdata import brapi
from investment_os.portfolio import db as pdb
from tests.investment_os.test_portfolio_analysis import (
    PRICES_SYNTH,
    SECTORS_SYNTH,
    _confirmed_policy,
    _snapshot,
)

SCREENER_SYNTH = {
    "preset": {"nome": "quality_deep_value", "versao": 1},
    "run_date": "2026-07-27",
    "pendencias_globais_do_preset": ["dividend yield indisponível no MVP"],
    "empresas": [
        # criterios_* como STRING "; "-separada — formato REAL do gold
        # (screener/run.py faz "; ".join). Fixture fiel ao esquema de produção.
        {"ticker": "GMAT3", "empresa": "GRUPO MATEUS", "setor": "Varejo",
         "status": "APROVADA", "pl": "5.08", "pvpa": "0.80", "roe_ltm": "16.24",
         "roe_med5": "15.16", "div_liq_ebitda": "0.28", "cagr_receita": "20.1",
         "conversao_caixa": "1.1", "criterios_reprovados": "",
         "criterios_nao_avaliados": "", "preco_data": "2026-07-27",
         "ultima_demonstracao": "1T26", "fontes": ["cvm", "b3"]},
        {"ticker": "XPTO3", "empresa": "XPTO SA", "setor": "Varejo",
         "status": "REPROVADA", "pl": "PREJUIZO", "pvpa": "1.9", "roe_ltm": "-3.0",
         "roe_med5": "2.0", "div_liq_ebitda": "4.1", "cagr_receita": "SERIE_NAO_COMPARAVEL",
         "conversao_caixa": "0.2", "criterios_reprovados": "pl; roe_ltm",
         "criterios_nao_avaliados": "cagr_receita", "preco_data": "2026-07-27",
         "ultima_demonstracao": "1T26", "fontes": ["cvm", "b3"]},
    ],
}
MACRO_SYNTH = {
    "data_geracao": "2026-07-28",
    "regimes": [{"dimensao": "politica_monetaria", "estado": "afrouxando",
                 "detalhe": "Selic 14.25%", "confianca": "ALTA",
                 "data_base": "2026-07-27", "fonte": "bcb_sgs:432", "natureza": "FATO"}],
    "series_recentes": {}, "premissas": ["meta IPCA 3.0%"], "fontes": {},
    "fora_do_escopo_desta_fase": ["EUA"],
}
TESOURO_SYNTH = {
    "data_base": "2026-07-27",
    "fonte": "Tesouro Transparente — varejo; NÃO é curva ANBIMA",
    "titulos": [{"tipo": "Tesouro IPCA+", "vencimento": "2050-08-15",
                 "taxa_compra_pct": 7.37, "modelado": True,
                 "duration_macaulay_anos": 24.0, "dv01_brl": 0.4},
                {"tipo": "Tesouro Prefixado", "vencimento": "2032-01-01",
                 "taxa_compra_pct": 13.4, "modelado": True,
                 "duration_macaulay_anos": 4.6, "dv01_brl": 0.3}],
    "curvas": {}, "radar_janelas": [
        {"tipo": "Tesouro IPCA+", "vencimento": "2050-08-15", "taxa_atual_pct": 7.37,
         "percentil": 94.3, "criterio": "p80", "saida_hysteresis_pct": 7.0,
         "invalidacao": "abaixo de 7.0%", "nota": "alta histórica"},
        {"tipo": "Tesouro Prefixado", "vencimento": "2032-01-01", "taxa_atual_pct": 13.4,
         "percentil": 89.0, "criterio": "p80", "saida_hysteresis_pct": 12.5,
         "invalidacao": "abaixo de 12.5%", "nota": "alta histórica"}],
    "parametros_radar": {"percentil_entrada": 80},
    "historico_oficial_desde": "2004-12-31",
}
REGISTRY_SYNTH = pd.DataFrame([
    {"ticker": "GMAT3", "tipo": "acao_br", "classificacao_confianca": "ALTA",
     "cnpj_emissor": "24.990.777/0001-09", "ultimo_pregao": dt.date(2026, 7, 27),
     "ultimo_fechamento": 8.1, "cd_bdi": "2", "especificacao": "ON", "fonte": "x"},
    {"ticker": "HGLG11", "tipo": "fii", "classificacao_confianca": "ALTA",
     "cnpj_emissor": None, "ultimo_pregao": dt.date(2026, 7, 27),
     "ultimo_fechamento": 160.0, "cd_bdi": "12", "especificacao": "CI", "fonte": "x"},
])


@pytest.fixture()
def env(tmp_path, monkeypatch):
    gold = tmp_path / "gold"
    silver = tmp_path / "silver"
    gold.mkdir()
    silver.mkdir()
    monkeypatch.setattr("investment_os.config.GOLD_DIR", gold)
    monkeypatch.setattr("investment_os.config.SILVER_DIR", silver)
    monkeypatch.setattr("investment_os.portfolio.db.default_db_path",
                        lambda: tmp_path / "p.db")
    (gold / "screener_quality_deep_value.json").write_text(
        json.dumps(SCREENER_SYNTH), encoding="utf-8")
    (gold / "macro_regimes.json").write_text(json.dumps(MACRO_SYNTH), encoding="utf-8")
    (gold / "tesouro_paineis.json").write_text(json.dumps(TESOURO_SYNTH), encoding="utf-8")
    REGISTRY_SYNTH.to_parquet(silver / "asset_registry.parquet", index=False)
    monkeypatch.setattr(
        "investment_os.portfolio.analysis.load_prices",
        lambda tickers: {t: PRICES_SYNTH[t] for t in tickers if t in PRICES_SYNTH})
    monkeypatch.setattr("investment_os.portfolio.analysis.load_sectors",
                        lambda: SECTORS_SYNTH)
    return tmp_path


class TestScreenMarket:
    def test_contagens_fonte_data_base(self, env):
        r = tools.screen_market()
        assert r["ok"] and r["data_base"] == "2026-07-27"
        assert r["dados"]["contagens"] == {"APROVADA": 1, "REPROVADA": 1}
        assert "CVM" in r["fonte"] and any("recomendação" in a for a in r["avisos"])

    def test_filtro_status(self, env):
        r = tools.screen_market(status="APROVADA")
        assert [e["ticker"] for e in r["dados"]["empresas"]] == ["GMAT3"]

    def test_status_invalido(self, env):
        r = tools.run_tool("screen_market", {"status": "OTIMA"})
        assert not r["ok"] and r["erro"]["codigo"] == "status_invalido"


class TestAnalyzeAsset:
    def test_com_fundamentos(self, env):
        r = tools.analyze_asset("gmat3")
        assert r["ok"] and r["dados"]["fundamentos_screener"]["status"] == "APROVADA"
        assert r["dados"]["registro_b3"]["tipo"] == "acao_br"

    def test_somente_registro_avisa_sem_fundamentos(self, env):
        r = tools.analyze_asset("HGLG11")
        assert r["ok"] and r["dados"]["fundamentos_screener"] is None
        assert any("fundamentalista" in a for a in r["avisos"])

    def test_desconhecido(self, env):
        r = tools.run_tool("analyze_asset", {"ticker": "ZZZZ99"})
        assert not r["ok"] and r["erro"]["codigo"] == "ativo_nao_encontrado"


class TestCompareAssets:
    def test_comparacao_com_ausente(self, env):
        r = tools.compare_assets(["GMAT3", "XPTO3", "NADA3"])
        assert r["ok"] and len(r["dados"]["comparacao"]) == 2
        assert r["dados"]["ausentes"] == ["NADA3"]
        assert any("setor" in a for a in r["avisos"])

    def test_minimo_dois(self, env):
        r = tools.run_tool("compare_assets", {"tickers": ["GMAT3"]})
        assert not r["ok"] and r["erro"]["codigo"] == "parametro_invalido"


class TestPortfolioTools:
    def test_sem_carteira(self, env):
        r = tools.run_tool("analyze_portfolio", {})
        assert not r["ok"] and r["erro"]["codigo"] == "sem_carteira"

    def test_analise_sem_ips_avisa(self, env):
        conn = pdb.connect()
        conn.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
        conn.execute("INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, 'x', 'p')")
        conn.commit()
        _snapshot(conn, [{"ticker": "VALE3", "quantity": 100, "avg_cost": 50.0}])
        conn.close()
        r = tools.analyze_portfolio()
        assert r["ok"] and any("IPS" in a for a in r["avisos"])

    def test_rebalance_exige_ips(self, env):
        conn = pdb.connect()
        conn.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
        conn.execute("INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, 'x', 'p')")
        conn.commit()
        _snapshot(conn, [{"ticker": "VALE3", "quantity": 100, "avg_cost": 50.0}])
        conn.close()
        r = tools.run_tool("propose_rebalance", {})
        assert not r["ok"] and r["erro"]["codigo"] == "politica_nao_confirmada"

    def test_rebalance_com_ips(self, env):
        conn = pdb.connect()
        conn.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
        conn.execute("INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, 'x', 'p')")
        conn.commit()
        _snapshot(conn, [{"ticker": "VALE3", "quantity": 100, "avg_cost": 50.0}])
        _confirmed_policy(conn)
        conn.close()
        r = tools.propose_rebalance(months=6)
        assert r["ok"] and "aporte" in " ".join(r["avisos"]).lower()


class TestMacroTesouro:
    def test_tesouro_filtro_tipo(self, env):
        r = tools.analyze_tesouro_window(tipo="ipca")
        assert r["ok"] and len(r["dados"]["titulos_resumo"]) == 1
        assert r["dados"]["radar_janelas"][0]["percentil"] == 94.3
        assert any("previsão" in a for a in r["avisos"])

    def test_macro_natureza(self, env):
        r = tools.analyze_macro_regime()
        assert r["ok"] and r["dados"]["regimes"][0]["natureza"] == "FATO"
        assert any("EXPECTATIVA" in a for a in r["avisos"])


class TestExplainRetrieve:
    def test_explica_pl_por_alias(self):
        r = tools.explain_metric("P/L")
        assert r["ok"] and "lucro" in r["dados"]["formula"].lower()
        assert any("nunca viram 0" in a for a in r["avisos"])

    def test_metrica_desconhecida_lista_disponiveis(self):
        r = tools.run_tool("explain_metric", {"metrica": "sharpe"})
        assert not r["ok"] and "disponíveis" in r["erro"]["mensagem"]

    def test_fontes_todas_e_uma(self):
        todas = tools.retrieve_source()
        assert todas["ok"] and any(s["source_id"] == "cvm_dados_abertos" for s in todas["dados"])
        uma = tools.retrieve_source("bcb_sgs")
        assert uma["ok"] and uma["dados"]["orgao"].startswith("Banco Central")
        assert any("PROIBIDOS" in a for a in todas["avisos"])


class TestIntraday:
    def test_indisponivel_traz_oficial(self, env, monkeypatch):
        def _boom(t):
            raise brapi.BrapiUnavailableError("down")
        monkeypatch.setattr(brapi, "get_quote", _boom)
        r = tools.run_tool("get_intraday_quote", {"ticker": "GMAT3"})
        assert not r["ok"] and r["erro"]["codigo"] == "intradiario_indisponivel"
        assert "8.1" in r["erro"]["mensagem"]

    def test_ok_rotulado(self, env, monkeypatch):
        monkeypatch.setattr(brapi, "get_quote", lambda t: {
            "ticker": t, "preco": 8.3, "fonte": brapi.FONTE, "aviso": brapi.AVISO,
            "usavel_em_calculos": False, "data_hora": "2026-07-28T15:00:00Z"})
        r = tools.get_intraday_quote("GMAT3")
        assert r["ok"] and "AGREGADOR" in r["fonte"]
        assert r["dados"]["oficial_d1"]["ultimo_pregao"] == "2026-07-27"


class TestChallengeThesis:
    def test_reprovada_lista_criterios_do_formato_gold(self, env):
        r = tools.challenge_thesis("XPTO3")
        assert r["ok"]
        ev = r["dados"]["evidencias_contrarias"]
        # string "pl; roe_ltm" vira 2 critérios INTEIROS — nunca caracteres
        assert "Critério do screener REPROVADO: pl" in ev
        assert "Critério do screener REPROVADO: roe_ltm" in ev
        assert not any(len(c.split(": ")[-1]) == 1 for c in ev if "REPROVADO" in c)
        joined = " ".join(ev)
        assert "NÃO AVALIÁVEL" in joined and "cagr_receita" in joined
        assert any("red-team" in a for a in r["avisos"])

    def test_custo_oportunidade_rotula_real_vs_nominal(self, env):
        ev = tools.challenge_thesis("XPTO3")["dados"]["evidencias_contrarias"]
        ipca = [c for c in ev if "Tesouro IPCA+" in c and "Custo de oportunidade" in c]
        pre = [c for c in ev if "Tesouro Prefixado" in c and "Custo de oportunidade" in c]
        assert len(ipca) == 1 and "REAL" in ipca[0] and "7.37%" in ipca[0]
        assert len(pre) == 1 and "NOMINAL" in pre[0] and "13.4%" in pre[0]
        assert any("não são" in c and "comparáveis" in c for c in ev)

    def test_radar_vazio_nao_quebra(self, env, monkeypatch, tmp_path):
        import json as _json
        vazio = {**TESOURO_SYNTH, "radar_janelas": []}
        gold = tmp_path / "gold2"
        gold.mkdir()
        (gold / "tesouro_paineis.json").write_text(_json.dumps(vazio), encoding="utf-8")
        (gold / "screener_quality_deep_value.json").write_text(
            _json.dumps(SCREENER_SYNTH), encoding="utf-8")
        (gold / "macro_regimes.json").write_text(_json.dumps(MACRO_SYNTH), encoding="utf-8")
        monkeypatch.setattr("investment_os.config.GOLD_DIR", gold)
        r = tools.challenge_thesis("XPTO3")
        assert r["ok"] and not any("Custo de oportunidade" in c
                                   for c in r["dados"]["evidencias_contrarias"])

    def test_aprovada_alerta_vies_confirmacao(self, env):
        r = tools.challenge_thesis("GMAT3")
        assert any("viés de" in c for c in r["dados"]["evidencias_contrarias"])

    def test_crit_list_aceita_string_e_lista(self):
        assert tools._crit_list("pl; roe_ltm") == ["pl", "roe_ltm"]
        assert tools._crit_list(["pl", "roe_ltm"]) == ["pl", "roe_ltm"]
        assert tools._crit_list("") == [] == tools._crit_list(None)


class TestRunToolSaneamento:
    def test_ferramenta_desconhecida(self):
        r = tools.run_tool("drop_tables", {})
        assert not r["ok"] and r["erro"]["codigo"] == "ferramenta_desconhecida"

    def test_parametro_invalido(self, env):
        r = tools.run_tool("analyze_asset", {"simbolo": "GMAT3"})
        assert not r["ok"] and r["erro"]["codigo"] == "parametro_invalido"

    def test_excecao_inesperada_nao_vaza_detalhes(self, env, monkeypatch):
        def _boom(**kw):
            raise RuntimeError("/home/user/segredo.db: sql error")
        monkeypatch.setitem(tools._REGISTRY, "analyze_macro_regime", _boom)
        r = tools.run_tool("analyze_macro_regime", {})
        assert not r["ok"] and r["erro"]["codigo"] == "erro_interno"
        assert "segredo" not in json.dumps(r)

    def test_definicoes_cobrem_registro(self):
        assert {d["name"] for d in tools.TOOL_DEFINITIONS} == set(tools._REGISTRY)
