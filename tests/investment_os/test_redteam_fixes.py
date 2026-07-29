"""Regressão dos achados do red-team da Fase 5 (fixtures sintéticas)."""
import pytest

from investment_os.portfolio import db as pdb
from investment_os.portfolio.importer import _cell_is_formula, _clean_number
from investment_os.portfolio.profile import (
    assess,
    confirm_policy,
    create_policy_version,
    generate_ips,
    validate_ips_content,
)
from investment_os.portfolio.rebalance import build_plan
from investment_os.portfolio.analysis import analyze_snapshot
from tests.investment_os.test_importer import REFERENCE_SYNTHETIC
from tests.investment_os.test_portfolio_analysis import (
    PRICES_SYNTH,
    SECTORS_SYNTH,
    _confirmed_policy,
    _snapshot,
)
from tests.investment_os.test_profile_ips import FULL_ANSWERS


@pytest.fixture(autouse=True)
def _synth(monkeypatch):
    monkeypatch.setattr(
        "investment_os.portfolio.importer.load_reference", lambda: REFERENCE_SYNTHETIC
    )
    monkeypatch.setattr(
        "investment_os.portfolio.analysis.load_prices",
        lambda tickers: {t: PRICES_SYNTH[t] for t in tickers if t in PRICES_SYNTH},
    )
    monkeypatch.setattr("investment_os.portfolio.analysis.load_sectors", lambda: SECTORS_SYNTH)


@pytest.fixture()
def conn(tmp_path):
    c = pdb.connect(tmp_path / "db.sqlite")
    c.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
    c.execute("INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, 'x', 'p')")
    c.commit()
    yield c
    c.close()


class TestAchado21ViolacaoPorAtivoNoPlano:
    def test_asset_limit_critico_gera_acao_nao_aumentar(self, conn):
        _confirmed_policy(conn, monthly=1000.0)
        # VALE3 dominante: viola limite por ativo (10%) criticamente
        sid = _snapshot(conn, [
            {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 1000},
            {"ticker": "PETR4", "cnpj": "33.000.167/0001-01", "quantity": 100},
        ])
        plan = build_plan(conn, 1, sid)
        vale = [a for a in plan["acoes"] if a["key"] == "VALE3" and a["scope"] == "asset"]
        assert vale and vale[0]["action"] == "nao_aumentar" and vale[0]["priority"] == 1

    def test_nenhuma_violacao_critica_some_do_plano(self, conn):
        _confirmed_policy(conn, monthly=1000.0)
        sid = _snapshot(conn, [
            {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 1000},
            {"ticker": "PETR4", "cnpj": "33.000.167/0001-01", "quantity": 100},
        ])
        plan = build_plan(conn, 1, sid)
        criticas = [v for v in analyze_snapshot(
            conn, sid, __import__("json").loads(conn.execute(
                "SELECT content_json FROM policy_version WHERE status='confirmed'"
            ).fetchone()["content_json"])
        )["violacoes"] if v["severidade"] == "critica"]
        addressed_keys = {a["key"] for a in plan["acoes"] if a["priority"] == 1}
        remaining_keys = {v["chave"] for v in plan["violacoes_remanescentes"]}
        for v in criticas:
            assert v["chave"] in addressed_keys | remaining_keys


class TestAchado31Duplicatas:
    def test_lote_diferente_vira_ambiguo_nao_descartado(self, conn, tmp_path):
        from investment_os.portfolio.importer import start_import

        p = tmp_path / "c.csv"
        p.write_bytes("ticker;quantidade\nVALE3;100\nVALE3;50\n".encode())
        prev = start_import(conn, 1, p, "c.csv")
        assert prev["counts"].get("ambiguous") == 1
        assert prev["counts"].get("duplicate") is None

    def test_linha_identica_continua_duplicata(self, conn, tmp_path):
        from investment_os.portfolio.importer import start_import

        p = tmp_path / "c.csv"
        p.write_bytes("ticker;quantidade\nVALE3;100\nVALE3;100\n".encode())
        prev = start_import(conn, 1, p, "c.csv")
        assert prev["counts"].get("duplicate") == 1


class TestAchado51ValidacaoIPS:
    def test_min_maior_que_max_rejeitado(self):
        errors = validate_ips_content({"faixas_por_classe": {"acao_br": {"min_pct": 80, "max_pct": 20}}})
        assert any("mínimo" in e for e in errors)

    def test_soma_minimos_impossivel(self):
        errors = validate_ips_content({"faixas_por_classe": {
            "a": {"min_pct": 60, "max_pct": 100}, "b": {"min_pct": 60, "max_pct": 100}}})
        assert any("excede 100%" in e for e in errors)

    def test_soma_maximos_insuficiente(self):
        errors = validate_ips_content({"faixas_por_classe": {
            "a": {"min_pct": 0, "max_pct": 30}, "b": {"min_pct": 0, "max_pct": 30}}})
        assert any("abaixo de 100%" in e for e in errors)

    def test_create_version_bloqueia_ips_invalida(self, conn):
        with pytest.raises(ValueError, match="IPS incoerente"):
            create_policy_version(conn, 1, {"faixas_por_classe": {}}, "teste", "u")

    def test_ips_gerada_e_valida(self, conn):
        a = assess(conn, 1, FULL_ANSWERS)
        assert validate_ips_content(generate_ips(a)) == []

    def test_confirmar_superseded_bloqueado(self, conn):
        a = assess(conn, 1, FULL_ANSWERS)
        v1 = create_policy_version(conn, 1, generate_ips(a), "v1", "u")
        create_policy_version(conn, 1, generate_ips(a), "v2", "u")  # v1 -> superseded
        with pytest.raises(ValueError, match="rascunho"):
            confirm_policy(conn, v1["version_id"])


class TestAchado52ProibicaoCripto:
    def test_proibicao_preservada_no_caminho_de_biblioteca(self, conn):
        answers = dict(FULL_ANSWERS, classes_proibidas="cripto")
        a = assess(conn, 1, answers)
        ips = generate_ips(a)
        assert "cripto" in ips["classes_proibidas"]
        assert ips["faixas_por_classe"]["cripto"]["max_pct"] == 0

    def test_classe_proibida_em_carteira_gera_acao_reduzir(self, conn):
        answers = dict(FULL_ANSWERS, classes_proibidas="cripto")
        _confirmed_policy(conn, monthly=1000.0, answers=answers)
        sid = _snapshot(conn, [
            {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 100},
            {"ticker": "HGLG11", "asset_class": "cripto", "quantity": 10},  # sintético
        ])
        plan = build_plan(conn, 1, sid)
        acao = [a for a in plan["acoes"] if a["key"] == "cripto"]
        assert acao and acao[0]["action"] == "reduzir" and acao[0]["priority"] == 1


class TestAchado11PiiNumerica:
    def test_cpf_em_campo_numerico_rejeita_linha(self, conn, tmp_path):
        from investment_os.portfolio.importer import start_import

        p = tmp_path / "c.csv"
        p.write_bytes("ticker;quantidade\nVALE3;12345678901\n".encode())
        prev = start_import(conn, 1, p, "c.csv")
        assert prev["counts"].get("rejected") == 1
        assert "12345678901" not in str(prev["rows"])


class TestAchado23ScrapRestante:
    def test_resto_nao_vai_para_classe_acima_do_teto(self, conn):
        _confirmed_policy(conn, monthly=100.0)
        # fii não-crítico acima do teto (20 < w <= 25): não pode receber aporte
        sid = _snapshot(conn, [
            {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 100},   # 6000
            {"ticker": "HGLG11", "asset_class": "fii", "quantity": 12},           # 1920 (~24%)
        ])
        plan = build_plan(conn, 1, sid)
        assert plan["proximo_aporte"].get("fii", 0) == 0 or "fii" not in plan["proximo_aporte"]


class TestFormulasENumeros:
    def test_prefixos_de_injecao(self):
        assert _cell_is_formula("=cmd|calc")
        assert _cell_is_formula("+cmd|calc")
        assert _cell_is_formula("-cmd|calc")
        assert _cell_is_formula("@SUM(A1)")
        assert not _cell_is_formula("-5")
        assert not _cell_is_formula("+1.234,56")

    def test_milhar_pt_br(self):
        assert _clean_number("1.234") == 1234.0
        assert _clean_number("1.234.567") == 1234567.0
        assert _clean_number("1.234,56") == 1234.56
        assert _clean_number("61,50") == 61.5


class TestAuditoriaB1CorrecaoNaoPromoveRejeitada:
    def test_linha_sem_quantidade_permanece_rejeitada_apos_correcao(self, conn, tmp_path):
        from investment_os.portfolio.importer import correct_row, start_import

        p = tmp_path / "c.csv"
        p.write_bytes("ticker;quantidade\nXPTO9;\nVALE3;10\n".encode())
        prev = start_import(conn, 1, p, "c.csv")
        rej = next(r for r in prev["rows"] if r["status"] == "rejected")
        prev = correct_row(conn, prev["import_id"], rej["row_id"], "PETR4")
        fixed = next(r for r in prev["rows"] if r["row_id"] == rej["row_id"])
        assert fixed["status"] == "rejected"
        assert "quantidade" in fixed["reason"]


class TestAuditoriaB2AporteObrigatorio:
    def test_ips_sem_aporte_rejeitada(self):
        from investment_os.portfolio.profile import validate_ips_content

        errors = validate_ips_content({"faixas_por_classe": {"a": {"min_pct": 0, "max_pct": 100}}})
        assert any("aporte_mensal_configurado" in e for e in errors)
