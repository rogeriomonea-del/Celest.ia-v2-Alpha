from datetime import date

from investment_os.engine.periods import PeriodValue, isolate_quarters, ttm


def q(y, m_start, m_end, v, d_end=None):
    last_day = {3: 31, 6: 30, 9: 30, 12: 31}[m_end]
    return PeriodValue(date(y, m_start, 1), date(y, m_end, d_end or last_day), v)


class TestIsolateQuarters:
    def test_ytd_vira_trimestre_isolado(self):
        # T1 isolado + YTD 6m => T2 = YTD6 - T1... via cadeia YTD (T1 tb é YTD3? não)
        periods = [q(2025, 1, 3, 10.0), q(2025, 1, 6, 25.0), q(2025, 1, 9, 45.0)]
        # sem YTD3 na cadeia, T2 não é derivável de YTD6 (precisa YTD3); mas T3 = YTD9-YTD6
        out = isolate_quarters(periods)
        assert q(2025, 1, 3, 10.0) in out
        assert any(p.start == date(2025, 7, 1) and abs(p.value - 20.0) < 1e-9 for p in out)

    def test_trimestres_isolados_passam_direto(self):
        periods = [q(2025, 1, 3, 10.0), q(2025, 4, 6, 15.0)]
        out = isolate_quarters(periods)
        assert len(out) == 2 and out[1].value == 15.0

    def test_preferencia_ao_isolado_sobre_derivado(self):
        periods = [q(2025, 1, 3, 10.0), q(2025, 4, 6, 14.0), q(2025, 1, 6, 25.0)]
        out = isolate_quarters(periods)
        t2 = [p for p in out if p.start == date(2025, 4, 1)]
        assert len(t2) == 1 and t2[0].value == 14.0


class TestTTM:
    def test_sem_trimestres_usa_anual(self):
        annual = q(2025, 1, 12, 100.0)
        value, desc = ttm(annual, [])
        assert value == 100.0 and "2025" in desc

    def test_ttm_com_um_trimestre(self):
        annual = q(2025, 1, 12, 100.0)
        quarters = [q(2025, 1, 3, 20.0), q(2026, 1, 3, 30.0)]
        value, _ = ttm(annual, quarters)
        assert value == 110.0

    def test_sem_homologo_nao_soma(self):
        annual = q(2025, 1, 12, 100.0)
        value, desc = ttm(annual, [q(2026, 1, 3, 30.0)])
        assert value is None and "homólogo" in desc

    def test_sem_anual(self):
        value, _ = ttm(None, [])
        assert value is None
