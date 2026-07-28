"""Motor de regimes macro — regras determinísticas (fixtures sintéticas)."""
from datetime import date, timedelta

from investment_os.engine.regimes import (
    atividade,
    cambio,
    expectativas_inflacao,
    inflacao,
    politica_monetaria,
    risco_fiscal,
)

TODAY = date(2026, 7, 28)


def monthly(values, end=TODAY):
    out = []
    y, m = end.year, end.month
    for v in reversed(values):
        out.append((date(y, m, 1), v))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return sorted(out)


class TestInflacao:
    def test_acelerando(self):
        # 12 meses a 0,3%/m e últimos 3 a 0,8%/m
        r = inflacao(monthly([0.3] * 15 + [0.8] * 3), today=TODAY)
        assert r.estado == "acelerando" and r.confianca in ("ALTA", "MEDIA")

    def test_desacelerando(self):
        r = inflacao(monthly([0.8] * 15 + [0.1] * 3), today=TODAY)
        assert r.estado == "desacelerando"

    def test_serie_curta_indisponivel(self):
        r = inflacao(monthly([0.4] * 6), today=TODAY)
        assert r.estado == "INDISPONIVEL" and r.natureza == "DADO AUSENTE"

    def test_dado_velho_reduz_confianca(self):
        r = inflacao(monthly([0.4] * 18, end=date(2025, 12, 1)), today=TODAY)
        assert r.confianca == "BAIXA"


class TestPoliticaMonetaria:
    def test_apertando(self):
        s = [(TODAY - timedelta(days=250), 10.0), (TODAY - timedelta(days=200), 11.0),
             (TODAY - timedelta(days=10), 12.0)]
        assert politica_monetaria(s, today=TODAY).estado == "apertando"

    def test_afrouxando(self):
        s = [(TODAY - timedelta(days=250), 15.0), (TODAY - timedelta(days=10), 14.25)]
        assert politica_monetaria(s, today=TODAY).estado == "afrouxando"

    def test_sem_historico(self):
        s = [(TODAY - timedelta(days=10), 14.25), (TODAY, 14.25)]
        assert politica_monetaria(s, today=TODAY).estado == "INDISPONIVEL"


class TestAtividadeCambioFiscal:
    def test_atividade_acelerando(self):
        r = atividade(monthly([100] * 4 + [100, 100, 100, 104, 104, 104]), today=TODAY)
        assert r.estado == "acelerando"

    def test_cambio_fraco(self):
        base = [(TODAY - timedelta(days=i), 5.0) for i in range(360, 5, -1)]
        base.append((TODAY, 5.9))
        assert cambio(base, today=TODAY).estado == "real_fraco"

    def test_fiscal_aumentando(self):
        r = risco_fiscal(monthly([75.0] * 13 + [78.0, 80.0, 81.0]), today=TODAY)
        assert r.estado == "aumentando"


class TestExpectativas:
    def test_ancoradas_e_rotuladas_como_expectativa(self):
        r = expectativas_inflacao(4.2, "2026-07-24")
        assert r.estado == "ancoradas"
        assert "EXPECTATIVA DE MERCADO" in r.natureza

    def test_desancoradas(self):
        assert expectativas_inflacao(5.5, "2026-07-24").estado == "desancoradas"

    def test_indisponivel(self):
        assert expectativas_inflacao(None, None).estado == "INDISPONIVEL"
