"""Questionário adaptativo, scores por dimensão, conflitos e IPS versionada."""
import pytest

from investment_os.portfolio import db as pdb
from investment_os.portfolio.profile import (
    QUESTIONS,
    assess,
    confirm_policy,
    confirmed_policy,
    create_policy_version,
    detect_conflicts,
    generate_ips,
    next_questions,
)

FULL_ANSWERS = {
    "horizonte": ">10 anos", "reserva_meses": ">12 meses",
    "renda_estabilidade": "estável", "dependentes": "nenhuma",
    "passivos": "nada", "queda_30": "aportaria mais", "drawdown_max": "35%",
    "experiencia": "2-5 anos", "conhecimento_derivativos": "em parte",
    "necessidade_renda": "em >10 anos", "objetivo_principal": "crescer acima da inflação",
    "capacidade_perda": "pouco", "concentracao_patrimonial": "20-50%",
    "exposicao_brasil": "alta", "interesse_internacional": "até 20% da carteira",
    "liquidez_necessaria": "<10%", "classes_proibidas": "nenhuma", "tributacao": "parcialmente",
}


@pytest.fixture()
def conn(tmp_path):
    c = pdb.connect(tmp_path / "db.sqlite")
    c.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
    c.commit()
    yield c
    c.close()


class TestQuestionario:
    def test_adaptativo_pergunta_dependente_so_com_gatilho(self):
        pend = next_questions({})
        ids = [q["id"] for q in pend]
        assert "conhecimento_derivativos" not in ids  # depende de experiência
        pend2 = next_questions({"experiencia": ">5 anos"})
        assert "conhecimento_derivativos" in [q["id"] for q in pend2]

    def test_scores_por_dimensao_sem_rotulo_unico(self, conn):
        result = assess(conn, 1, FULL_ANSWERS)
        assert "disposicao_risco" in result["scores"]
        assert "capacidade_risco" in result["scores"]
        assert "perfil" not in result  # nunca um rótulo único
        assert result["pending_questions"] == []
        assert result["confidence"] == "ALTA"

    def test_incompleto_reduz_confianca(self, conn):
        result = assess(conn, 1, {"horizonte": ">10 anos"})
        assert result["confidence"] == "BAIXA"
        assert len(result["pending_questions"]) > 5


class TestConflitos:
    def test_disposicao_alta_drawdown_baixo(self):
        answers = dict(FULL_ANSWERS, drawdown_max="10%")
        scores = {"disposicao_risco": 90, "drawdown_toleravel": 15}
        assert any("drawdown" in c for c in detect_conflicts(answers, scores))

    def test_sem_reserva_com_risco(self):
        answers = dict(FULL_ANSWERS, reserva_meses="nenhuma")
        scores = {"disposicao_risco": 90, "drawdown_toleravel": 65}
        assert any("reserva" in c for c in detect_conflicts(answers, scores))

    def test_horizonte_curto_agressivo(self):
        answers = dict(FULL_ANSWERS, horizonte="<3 anos", objetivo_principal="crescimento agressivo")
        scores = {"necessidade_retorno": 85}
        assert any("horizonte" in c for c in detect_conflicts(answers, scores))


class TestIPS:
    def test_capacidade_limita_disposicao(self, conn):
        answers = dict(FULL_ANSWERS, capacidade_perda="gravemente", drawdown_max="50%+")
        a = assess(conn, 1, answers)
        ips = generate_ips(a)
        # capacidade baixa (10) limita: banda de RV modesta e drawdown conservador
        assert ips["faixas_por_classe"]["acao_br"]["max_pct"] <= 45
        assert ips["drawdown_maximo_pct"] <= 20

    def test_retorno_e_faixa_premissa(self, conn):
        ips = generate_ips(assess(conn, 1, FULL_ANSWERS))
        assert ips["retorno_requerido"]["tipo"] == "faixa_premissa"
        assert "promessa" in ips["retorno_requerido"]["descricao"]

    def test_versionamento_com_motivo_e_anterior(self, conn):
        a = assess(conn, 1, FULL_ANSWERS)
        v1 = create_policy_version(conn, 1, generate_ips(a), "primeira versão", "usuario")
        v2 = create_policy_version(conn, 1, generate_ips(a), "ajuste de limites", "usuario")
        assert (v1["version"], v2["version"]) == (1, 2)
        row = conn.execute("SELECT * FROM policy_version WHERE id=?", (v2["version_id"],)).fetchone()
        assert row["prev_version"] == 1 and row["reason"] == "ajuste de limites"

    def test_sem_recomendacao_antes_da_confirmacao(self, conn):
        a = assess(conn, 1, FULL_ANSWERS)
        create_policy_version(conn, 1, generate_ips(a), "v1", "usuario")
        assert confirmed_policy(conn, 1) is None  # draft não vale

    def test_confirmacao(self, conn):
        a = assess(conn, 1, FULL_ANSWERS)
        v = create_policy_version(conn, 1, generate_ips(a), "v1", "usuario")
        confirm_policy(conn, v["version_id"])
        cp = confirmed_policy(conn, 1)
        assert cp is not None and cp["version"] == 1
        assert "faixas_por_classe" in cp["content"]

    def test_constraints_persistidas(self, conn):
        a = assess(conn, 1, FULL_ANSWERS)
        v = create_policy_version(conn, 1, generate_ips(a), "v1", "usuario")
        kinds = {r["kind"] for r in conn.execute(
            "SELECT kind FROM policy_constraint WHERE policy_version_id=?", (v["version_id"],))}
        assert {"class_band", "asset_limit", "issuer_limit", "sector_limit"} <= kinds

    def test_todas_as_questoes_tem_dimensao_e_opcoes(self):
        for q in QUESTIONS:
            assert q["options"] and q["dimension"]
