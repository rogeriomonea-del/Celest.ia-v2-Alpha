from datetime import date, timedelta

import pytest

from investment_os.engine.windows import analyze, hysteresis_signal


def make_series(rates):
    d0 = date(2026, 1, 5)
    return [(d0 + timedelta(days=i), r) for i, r in enumerate(rates)]


class TestAnalyze:
    def test_contagem_e_janelas(self):
        s = make_series([7.0, 7.2, 7.3, 7.0, 7.15, 7.1, 7.5])
        a = analyze(s, 7.11)
        assert a.total_sessions == 7
        assert a.sessions_at_or_above == 4  # 7.2, 7.3, 7.15, 7.5
        assert len(a.windows) == 3
        assert a.longest_window.sessions == 2
        assert a.max_rate == 7.5 and a.min_rate == 7.0
        assert a.last_occurrence == s[-1][0]

    def test_limite_igual_conta(self):
        a = analyze(make_series([7.11]), 7.11)
        assert a.sessions_at_or_above == 1

    def test_serie_vazia_erro(self):
        with pytest.raises(ValueError):
            analyze([], 7.0)

    def test_percentil(self):
        a = analyze(make_series([1.0, 2.0, 3.0, 4.0]), 3.0)
        assert a.threshold_percentile == 50.0


class TestHysteresis:
    def test_liga_e_so_desliga_abaixo_da_saida(self):
        s = make_series([6.9, 7.2, 7.05, 7.02, 6.94, 7.0])
        sig = hysteresis_signal(s, enter_at=7.11, exit_at=6.95)
        estados = [on for _, on in sig]
        # liga no 7.2; 7.05/7.02 mantêm; 6.94 desliga; 7.0 continua desligado
        assert estados == [False, True, True, True, False, False]

    def test_validacao(self):
        with pytest.raises(ValueError):
            hysteresis_signal(make_series([7.0]), 7.0, 7.5)
