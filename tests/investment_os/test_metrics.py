from investment_os.engine.metrics import (
    Status,
    cagr,
    cash_conversion,
    market_cap,
    net_debt,
    net_debt_to_ebitda,
    price_earnings,
    price_to_book,
    roe_ltm,
    roe_median_5y,
)


def _mcap(value: float):
    return market_cap({"ON": value}, {"ON": 1.0})


class TestMarketCap:
    def test_soma_classes(self):
        m = market_cap({"ON": 10.0, "PN": 12.0}, {"ON": 100.0, "PN": 50.0})
        assert m.ok and m.value == 10.0 * 100 + 12.0 * 50

    def test_classe_sem_preco_torna_indisponivel(self):
        m = market_cap({"ON": 10.0}, {"ON": 100.0, "PN": 50.0})
        assert m.status is Status.INDISPONIVEL and m.value is None

    def test_classe_sem_acoes_ignorada(self):
        m = market_cap({"ON": 10.0}, {"ON": 100.0, "PN": 0.0})
        assert m.ok


class TestPriceEarnings:
    def test_pl_normal(self):
        m = price_earnings(_mcap(1000.0), 100.0)
        assert m.ok and abs(m.value - 10.0) < 1e-12

    def test_prejuizo_nao_gera_numero(self):
        m = price_earnings(_mcap(1000.0), -5.0)
        assert m.status is Status.PREJUIZO and m.value is None

    def test_lucro_zero(self):
        assert price_earnings(_mcap(1000.0), 0.0).status is Status.PREJUIZO

    def test_sem_market_cap(self):
        m = price_earnings(market_cap({}, {}), 100.0)
        assert m.status is Status.INDISPONIVEL


class TestPriceToBook:
    def test_normal(self):
        assert abs(price_to_book(_mcap(500.0), 250.0).value - 2.0) < 1e-12

    def test_pl_negativo(self):
        assert price_to_book(_mcap(500.0), -1.0).status is Status.NAO_APLICAVEL


class TestRoe:
    def test_usa_pl_medio(self):
        m = roe_ltm(30.0, 100.0, 200.0)
        assert m.ok and abs(m.value - 0.2) < 1e-12

    def test_pl_medio_negativo(self):
        assert roe_ltm(30.0, -300.0, 100.0).status is Status.NAO_APLICAVEL

    def test_mediana_exige_4_exercicios(self):
        assert roe_median_5y([0.1, None, 0.2]).status is Status.DADO_INSUFICIENTE
        m = roe_median_5y([0.10, 0.12, 0.14, 0.30, None])
        assert m.ok and abs(m.value - 0.13) < 1e-12


class TestCagr:
    def test_normal(self):
        m = cagr(100.0, 200.0, 5)
        assert m.ok and abs(m.value - (2 ** 0.2 - 1)) < 1e-12

    def test_inicio_negativo_serie_nao_comparavel(self):
        m = cagr(-10.0, 200.0, 5)
        assert m.value is None and m.status is Status.TURNAROUND

    def test_fim_negativo(self):
        assert cagr(10.0, -5.0, 5).status is Status.SERIE_NAO_COMPARAVEL

    def test_zero_nao_gera_cagr(self):
        assert cagr(0.0, 100.0, 5).value is None


class TestDebt:
    def test_divida_liquida(self):
        nd = net_debt(100.0, 400.0, 150.0, 50.0)
        assert nd.ok and nd.value == 300.0

    def test_banco_nao_aplicavel(self):
        nd = net_debt(100.0, 400.0, 150.0, 0.0)
        m = net_debt_to_ebitda(nd, 200.0, is_bank=True)
        assert m.status is Status.NAO_APLICAVEL

    def test_ebitda_negativo(self):
        nd = net_debt(100.0, 400.0, 150.0, 0.0)
        assert net_debt_to_ebitda(nd, -10.0).status is Status.NAO_APLICAVEL


class TestCashConversion:
    def test_normal(self):
        assert abs(cash_conversion(120.0, 100.0).value - 1.2) < 1e-12

    def test_lucro_negativo(self):
        assert cash_conversion(120.0, -1.0).status is Status.NAO_APLICAVEL
