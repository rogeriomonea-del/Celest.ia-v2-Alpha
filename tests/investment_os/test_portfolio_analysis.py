"""Análise de carteira e rebalanceamento aporte-first (dados sintéticos rotulados)."""
import pytest

from investment_os.portfolio import db as pdb
from investment_os.portfolio.analysis import analyze_snapshot
from investment_os.portfolio.profile import (
    PolicyRequiredError,
    assess,
    confirm_policy,
    create_policy_version,
    generate_ips,
)
from investment_os.portfolio.rebalance import build_plan
from tests.investment_os.test_profile_ips import FULL_ANSWERS

# FIXTURE SINTÉTICA de preços (não é cotação real)
PRICES_SYNTH = {
    "VALE3": {"close": 60.0, "trade_date": "2026-07-27"},
    "PETR4": {"close": 40.0, "trade_date": "2026-07-27"},
    "ITUB4": {"close": 35.0, "trade_date": "2026-07-27"},
    "HGLG11": {"close": 160.0, "trade_date": "2026-07-27"},
    "WEGE3": {"close": 45.0, "trade_date": "2026-05-02"},  # stale de propósito
}
SECTORS_SYNTH = {
    "33.592.510/0001-54": "Mineração",
    "33.000.167/0001-01": "Petróleo e Gás",
}


@pytest.fixture(autouse=True)
def _synth(monkeypatch):
    monkeypatch.setattr(
        "investment_os.portfolio.analysis.load_prices",
        lambda tickers: {t: PRICES_SYNTH[t] for t in tickers if t in PRICES_SYNTH},
    )
    monkeypatch.setattr(
        "investment_os.portfolio.analysis.load_sectors", lambda: SECTORS_SYNTH
    )


@pytest.fixture()
def conn(tmp_path):
    c = pdb.connect(tmp_path / "db.sqlite")
    c.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
    c.execute("INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, 'x', 'p')")
    c.commit()
    yield c
    c.close()


def _snapshot(conn, positions, snapshot_id=1, version=1):
    conn.execute(
        "INSERT INTO portfolio_snapshot (id, portfolio_id, version, created_at, data_base,"
        " content_sha256) VALUES (?, 1, ?, 'x', '2026-06-30', ?)",
        (snapshot_id, version, f"hash{version}"),
    )
    for p in positions:
        conn.execute(
            "INSERT INTO position (snapshot_id, ticker, cnpj, asset_class, quantity, avg_cost,"
            " cost_status, currency, source) VALUES (?,?,?,?,?,?,?,?, 'import:1')",
            (snapshot_id, p["ticker"], p.get("cnpj"), p.get("asset_class", "acao_br"),
             p["quantity"], p.get("avg_cost"),
             "conhecido" if p.get("avg_cost") is not None else "desconhecido", "BRL"),
        )
    conn.commit()
    return snapshot_id


def _confirmed_policy(conn, monthly=10000.0, answers=FULL_ANSWERS):
    a = assess(conn, 1, answers)
    ips = generate_ips(a, monthly_contribution=monthly)
    v = create_policy_version(conn, 1, ips, "teste", "usuario")
    confirm_policy(conn, v["version_id"])
    return ips


BASIC_POSITIONS = [
    {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 100, "avg_cost": 55.0},
    {"ticker": "PETR4", "cnpj": "33.000.167/0001-01", "quantity": 200, "avg_cost": 30.0},
    {"ticker": "HGLG11", "asset_class": "fii", "quantity": 50},          # custo desconhecido
    {"ticker": "ZZZZ3", "quantity": 10},                                  # sem preço
]


class TestAnalysis:
    def test_pesos_e_cobertura(self, conn):
        sid = _snapshot(conn, BASIC_POSITIONS)
        a = analyze_snapshot(conn, sid)
        # 100*60 + 200*40 + 50*160 = 6000+8000+8000 = 22000
        assert a["patrimonio_precificado_brl"] == 22000.0
        assert a["qualidade_dados"]["sem_preco"] == ["ZZZZ3"]
        assert a["qualidade_dados"]["cobertura_pct"] == 75.0
        assert abs(a["pesos"]["por_ativo"]["PETR4"] - 36.36) < 0.01
        assert a["pesos"]["por_classe"]["fii"] == pytest.approx(36.36, abs=0.01)

    def test_ausencia_de_preco_nao_vira_zero(self, conn):
        sid = _snapshot(conn, BASIC_POSITIONS)
        a = analyze_snapshot(conn, sid)
        sem_preco = [p for p in a["posicoes"] if p["ticker"] == "ZZZZ3"][0]
        assert sem_preco["market_value"] is None
        assert "AUSENTE" in sem_preco["natureza"]

    def test_custo_desconhecido_preservado(self, conn):
        sid = _snapshot(conn, BASIC_POSITIONS)
        a = analyze_snapshot(conn, sid)
        hglg = [p for p in a["posicoes"] if p["ticker"] == "HGLG11"][0]
        assert hglg["avg_cost"] is None and hglg["cost_status"] == "desconhecido"
        assert "HGLG11" in a["qualidade_dados"]["custo_desconhecido"]

    def test_preco_stale_detectado(self, conn):
        sid = _snapshot(conn, [{"ticker": "WEGE3", "quantity": 10}])
        a = analyze_snapshot(conn, sid)
        assert "WEGE3" in a["qualidade_dados"]["precos_stale_7d"]
        assert a["confianca"] != "ALTA"

    def test_violacoes_contra_ips(self, conn):
        ips = _confirmed_policy(conn)
        # carteira 100% FII viola banda de fii (max 20) criticamente
        sid = _snapshot(conn, [{"ticker": "HGLG11", "asset_class": "fii", "quantity": 100}])
        a = analyze_snapshot(conn, sid, ips)
        v = [x for x in a["violacoes"] if x["chave"] == "fii"]
        assert v and v[0]["severidade"] == "critica"


class TestRebalance:
    def test_bloqueado_sem_ips_confirmada(self, conn):
        sid = _snapshot(conn, BASIC_POSITIONS)
        with pytest.raises(PolicyRequiredError):
            build_plan(conn, 1, sid)

    def test_aporte_vai_para_classes_deficitarias(self, conn):
        _confirmed_policy(conn, monthly=10000.0)
        sid = _snapshot(conn, BASIC_POSITIONS)
        plan = build_plan(conn, 1, sid)
        # renda_fixa está a 0% (min > 0): deve receber aporte
        assert plan["proximo_aporte"].get("renda_fixa", 0) > 0
        assert sum(plan["proximo_aporte"].values()) == pytest.approx(10000.0, abs=1.0)
        assert len(plan["plano_3_meses"]) == 3 and len(plan["plano_6_meses"]) == 6

    def test_aporte_first_evita_vendas(self, conn):
        _confirmed_policy(conn, monthly=10000.0)
        # fii em violação crítica mas diluível: R$22k carteira, fii ~36% vs teto 20+5
        sid = _snapshot(conn, BASIC_POSITIONS)
        plan = build_plan(conn, 1, sid)
        fii_actions = [a for a in plan["acoes"] if a["key"] == "fii"]
        if fii_actions and fii_actions[0]["priority"] == 1:
            assert fii_actions[0]["action"] == "nao_aumentar"  # dilui, não vende
            assert plan["vendas_evitadas_brl"] > 0
        assert not any(a["action"] == "reduzir" for a in plan["acoes"])

    def test_violacao_nao_diluivel_reduz(self, conn):
        _confirmed_policy(conn, monthly=100.0)  # aporte irrisório
        sid = _snapshot(conn, [
            {"ticker": "HGLG11", "asset_class": "fii", "quantity": 1000},  # 160k em fii
            {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 100},
        ])
        plan = build_plan(conn, 1, sid)
        fii_action = next(a for a in plan["acoes"] if a["key"] == "fii" and a["priority"] == 1)
        assert fii_action["action"] == "reduzir"
        assert "imposto não estimado" in fii_action.get("custo_imposto", "")

    def test_ativo_sem_preco_dados_insuficientes(self, conn):
        _confirmed_policy(conn)
        sid = _snapshot(conn, BASIC_POSITIONS)
        plan = build_plan(conn, 1, sid)
        zz = next(a for a in plan["acoes"] if a["key"] == "ZZZZ3")
        assert zz["action"] == "dados_insuficientes"
        assert "compra ou venda" in zz["rationale"]

    def test_nao_vende_apenas_por_valorizacao(self, conn):
        _confirmed_policy(conn, monthly=10000.0)
        # carteira dentro das faixas: VALE valorizou 50% mas não há violação
        sid = _snapshot(conn, [
            {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "quantity": 50, "avg_cost": 40.0},
            {"ticker": "PETR4", "cnpj": "33.000.167/0001-01", "quantity": 50, "avg_cost": 38.0},
        ])
        plan = build_plan(conn, 1, sid)
        assert not any(a["action"] in ("reduzir", "vender_por_tese_invalidada")
                       for a in plan["acoes"] if a["scope"] == "asset")

    def test_plano_persistido(self, conn):
        _confirmed_policy(conn)
        sid = _snapshot(conn, BASIC_POSITIONS)
        plan = build_plan(conn, 1, sid)
        n_actions = conn.execute(
            "SELECT COUNT(*) AS n FROM rebalance_action WHERE plan_id=?", (plan["plan_id"],)
        ).fetchone()["n"]
        n_months = conn.execute(
            "SELECT COUNT(*) AS n FROM contribution_plan WHERE plan_id=?", (plan["plan_id"],)
        ).fetchone()["n"]
        assert n_actions == len(plan["acoes"]) and n_months == 6

    def test_premissas_declaradas(self, conn):
        _confirmed_policy(conn)
        sid = _snapshot(conn, BASIC_POSITIONS)
        plan = build_plan(conn, 1, sid)
        assert any("preços estáticos" in p for p in plan["premissas"])
        assert any("imposto" in p for p in plan["premissas"])
