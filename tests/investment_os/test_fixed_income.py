from datetime import date

import pytest

from investment_os.engine.fixed_income import (
    NOTIONAL,
    mtm_scenarios,
    ntnb_cashflows,
    price_from_yield,
    risk_profile,
)

SETTLE = date(2026, 7, 24)
MATURITY = date(2050, 8, 15)


class TestCashflows:
    def test_zero_coupon_tem_um_fluxo(self):
        flows = ntnb_cashflows(SETTLE, MATURITY, with_coupons=False)
        assert flows == [(MATURITY, NOTIONAL)]

    def test_com_cupons_semestrais(self):
        flows = ntnb_cashflows(SETTLE, MATURITY, with_coupons=True)
        coupon_dates = [d for d, v in flows if v < NOTIONAL]
        # ~24 anos * 2 cupons/ano
        assert 46 <= len(coupon_dates) <= 50
        assert all(d.day == 15 for d in coupon_dates)
        assert flows[-1] == (MATURITY, NOTIONAL)

    def test_vencimento_passado_erro(self):
        with pytest.raises(ValueError):
            ntnb_cashflows(SETTLE, date(2020, 1, 1), False)


class TestPricing:
    def test_taxa_zero_preco_igual_soma_fluxos(self):
        p = price_from_yield(SETTLE, MATURITY, 0.0, with_coupons=False)
        assert abs(p - NOTIONAL) < 1e-9

    def test_preco_cai_com_taxa(self):
        p1 = price_from_yield(SETTLE, MATURITY, 6.0, True)
        p2 = price_from_yield(SETTLE, MATURITY, 7.0, True)
        assert p2 < p1

    def test_duration_zero_coupon_igual_prazo(self):
        rp = risk_profile(SETTLE, MATURITY, 7.11, with_coupons=False)
        prazo_anos = (MATURITY - SETTLE).days / 365.25
        assert abs(rp.macaulay_duration_years - prazo_anos) < 1e-9
        assert rp.modified_duration_years < rp.macaulay_duration_years

    def test_dv01_positivo_e_convexidade_positiva(self):
        rp = risk_profile(SETTLE, MATURITY, 7.11, with_coupons=False)
        assert rp.dv01_brl > 0
        assert rp.convexity > 0


class TestScenarios:
    def test_choques_monotonicos(self):
        rows = mtm_scenarios(SETTLE, MATURITY, 7.11, with_coupons=False)
        precos = [r["pu_novo"] for r in rows]
        assert precos == sorted(precos, reverse=True)  # -200bps maior preço
        neg200 = rows[0]
        assert neg200["choque_bps"] == -200 and neg200["variacao_pct"] > 0

    def test_decomposicao_duration_convexidade(self):
        rows = mtm_scenarios(SETTLE, MATURITY, 7.11, with_coupons=False)
        for r in rows:
            # duration + convexidade explicam quase toda a variação
            explicado = r["efeito_duration_brl"] + r["efeito_convexidade_brl"]
            total = r["pu_novo"] - price_from_yield(SETTLE, MATURITY, 7.11, False)
            assert abs(explicado - total) < abs(total) * 0.12 + 0.5
