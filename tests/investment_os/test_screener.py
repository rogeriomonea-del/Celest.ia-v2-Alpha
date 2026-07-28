"""Testes do preset Quality Deep Value e da resolução de escala de capital."""
from investment_os.engine.metrics import Metric, Status
from investment_os.screener.build_gold import resolve_share_scale
from investment_os.screener.presets import evaluate_quality_deep_value


def _row(**overrides):
    ok = lambda v, unit="x": Metric(v, Status.OK, unit=unit)  # noqa: E731
    base = {
        "is_financial": False,
        "pvpa": ok(0.8),
        "pe": ok(6.0),
        "roe_med5": ok(0.15),
        "nd_ebitda": ok(1.0),
        "rev_cagr5": ok(0.15),
        "ni_cagr5": ok(0.12),
        "pior_queda_receita": -0.05,
        "anos_serie": [2021, 2022, 2023, 2024, 2025],
        "lucro_positivo_todos_5a": True,
        "cfo_positivo_5a": 5,
        "fcf_positivo_5a": 4,
        "liquidez_media_63d_brl": 10_000_000.0,
    }
    base.update(overrides)
    return base


def _outcomes(results):
    return {c.criterion: c.outcome for c in results}


class TestPreset:
    def test_aprova_quando_tudo_passa(self):
        res = evaluate_quality_deep_value(_row(), pe_sector_p35=8.0, n_peers=10)
        assert all(c.outcome == "PASS" for c in res)

    def test_prejuizo_reprova_pl(self):
        row = _row(pe=Metric(None, Status.PREJUIZO))
        out = _outcomes(evaluate_quality_deep_value(row, None, 0))
        assert out["P/L positivo e baixo"] == "FAIL"

    def test_sem_pares_usa_limite_absoluto_declarado(self):
        res = evaluate_quality_deep_value(_row(pe=Metric(13.0, Status.OK)), None, 2)
        c = next(c for c in res if c.criterion == "P/L positivo e baixo")
        assert c.outcome == "FAIL" and "limitação declarada" in c.detail

    def test_percentil_setorial_aplicado(self):
        res = evaluate_quality_deep_value(_row(pe=Metric(9.0, Status.OK)), pe_sector_p35=8.0, n_peers=10)
        c = next(c for c in res if c.criterion == "P/L positivo e baixo")
        assert c.outcome == "FAIL" and "P35" in c.detail

    def test_dado_ausente_vira_not_evaluated_nunca_pass(self):
        row = _row(pvpa=Metric(None, Status.INDISPONIVEL), liquidez_media_63d_brl=None)
        out = _outcomes(evaluate_quality_deep_value(row, 8.0, 10))
        assert out["P/VPA < 1"] == "NOT_EVALUATED"
        assert out["Liquidez >= R$5M/dia"] == "NOT_EVALUATED"

    def test_banco_nao_avalia_divida(self):
        row = _row(is_financial=True, nd_ebitda=Metric(None, Status.NAO_APLICAVEL))
        out = _outcomes(evaluate_quality_deep_value(row, 8.0, 10))
        assert out["Dívida líq./EBITDA < 3"] == "NOT_EVALUATED"
        assert out["CFO positivo em >=4 dos 5 anos"] == "NOT_EVALUATED"


class TestShareScale:
    def test_valida_por_lpa_unidades(self):
        # 4,2 bi de ações reportadas em unidades; lucro 6,1 bi; LPA 1,45
        scale, note = resolve_share_scale(4_200_000_000, 6_100_000_000, 1.45, None)
        assert scale == 1.0 and "LPA" in note

    def test_valida_por_lpa_milhares(self):
        # 11,03 M reportado (= 11,03 bi em milhares); lucro 42 bi; LPA 3,85
        scale, _ = resolve_share_scale(11_030_000, 42_000_000_000, 3.85, None)
        assert scale == 1000.0

    def test_sem_validacao_retorna_none(self):
        scale, note = resolve_share_scale(1_000_000, None, None, None)
        assert scale is None

    def test_lpa_incoerente_rejeita(self):
        scale, note = resolve_share_scale(1_000_000, 6_000_000_000, 0.001, None)
        assert scale is None and "não validável" in note

    def test_fallback_vpa(self):
        # PL 180 bi; 4,54 M reportado: unidades -> VPA 39.647 (implausível);
        # milhares -> 39,6 (plausível)
        scale, note = resolve_share_scale(4_540_000, None, None, 180_000_000_000)
        assert scale == 1000.0 and "VPA" in note
