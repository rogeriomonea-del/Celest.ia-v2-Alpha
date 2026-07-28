"""Fórmulas financeiras determinísticas.

Funções puras e testadas — o LLM nunca calcula indicadores. Nenhum valor
"indisponível" vira 0: todo resultado carrega um Status explícito
(docs/METRIC_REGISTRY.md).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from statistics import median


class Status(str, Enum):
    OK = "OK"
    NAO_APLICAVEL = "NAO_APLICAVEL"
    PREJUIZO = "PREJUIZO"
    TURNAROUND = "TURNAROUND"
    DADO_INSUFICIENTE = "DADO_INSUFICIENTE"
    SERIE_NAO_COMPARAVEL = "SERIE_NAO_COMPARAVEL"
    INDISPONIVEL = "INDISPONIVEL"


@dataclass(frozen=True)
class Metric:
    value: float | None
    status: Status
    unit: str = ""
    formula: str = ""
    note: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status is Status.OK


def _missing(*vals: float | None) -> bool:
    return any(v is None for v in vals)


def market_cap(
    price_by_class: dict[str, float | None], shares_by_class: dict[str, float | None]
) -> Metric:
    """Valor de mercado total = soma preço x quantidade por classe econômica.

    Classes sem ações em circulação (qtde 0) são ignoradas; classe com ações mas
    sem preço torna o total INDISPONIVEL (não subestimar silenciosamente).
    """
    total = 0.0
    for cls, shares in shares_by_class.items():
        if shares is None or shares <= 0:
            continue
        price = price_by_class.get(cls)
        if price is None or price <= 0:
            return Metric(
                None, Status.INDISPONIVEL,
                note=f"classe {cls} tem {shares:.0f} ações mas preço indisponível",
            )
        total += shares * price
    if total <= 0:
        return Metric(None, Status.INDISPONIVEL, note="sem classes com ações e preço")
    return Metric(total, Status.OK, unit="BRL", formula="sum(preco_classe*qtde_classe)")


def price_earnings(mcap: Metric, net_income_ltm: float | None) -> Metric:
    """P/L = valor de mercado total / lucro líquido atribuível LTM."""
    if not mcap.ok:
        return Metric(None, Status.INDISPONIVEL, note="valor de mercado indisponível")
    if net_income_ltm is None:
        return Metric(None, Status.INDISPONIVEL, note="lucro LTM indisponível")
    if net_income_ltm <= 0:
        return Metric(None, Status.PREJUIZO, note="lucro LTM <= 0: P/L não se aplica")
    return Metric(
        mcap.value / net_income_ltm, Status.OK, unit="x",
        formula="market_cap/lucro_atribuivel_ltm",
    )


def price_to_book(mcap: Metric, equity_attrib: float | None) -> Metric:
    """P/VPA = valor de mercado total / PL atribuível aos controladores."""
    if not mcap.ok:
        return Metric(None, Status.INDISPONIVEL, note="valor de mercado indisponível")
    if equity_attrib is None:
        return Metric(None, Status.INDISPONIVEL, note="PL atribuível indisponível")
    if equity_attrib <= 0:
        return Metric(None, Status.NAO_APLICAVEL, note="PL <= 0")
    return Metric(
        mcap.value / equity_attrib, Status.OK, unit="x",
        formula="market_cap/pl_atribuivel",
    )


def roe_ltm(net_income_ltm: float | None, equity_start: float | None, equity_end: float | None) -> Metric:
    """ROE = lucro atribuível LTM / PL médio (início e fim do período)."""
    if _missing(net_income_ltm, equity_start, equity_end):
        return Metric(None, Status.INDISPONIVEL)
    avg = (equity_start + equity_end) / 2.0
    if avg <= 0:
        return Metric(None, Status.NAO_APLICAVEL, note="PL médio <= 0")
    return Metric(
        net_income_ltm / avg, Status.OK, unit="fração",
        formula="lucro_atribuivel_ltm/pl_medio",
    )


def roe_median_5y(annual_roe: list[float | None]) -> Metric:
    """Mediana dos ROE anuais; exige >= 4 exercícios válidos."""
    valid = [r for r in annual_roe if r is not None]
    if len(valid) < 4:
        return Metric(
            None, Status.DADO_INSUFICIENTE,
            note=f"apenas {len(valid)} exercícios válidos (mínimo 4)",
        )
    return Metric(median(valid), Status.OK, unit="fração", formula="mediana(roe_anual)")


def margin(result: float | None, revenue: float | None, name: str = "margem") -> Metric:
    if _missing(result, revenue):
        return Metric(None, Status.INDISPONIVEL)
    if revenue <= 0:
        return Metric(None, Status.NAO_APLICAVEL, note="receita <= 0")
    return Metric(result / revenue, Status.OK, unit="fração", formula=f"{name}=resultado/receita")


def net_debt(
    gross_debt_st: float | None, gross_debt_lt: float | None,
    cash: float | None, st_investments: float | None,
) -> Metric:
    """Dívida líquida = empréstimos CP+LP - caixa - aplicações financeiras CP."""
    if _missing(gross_debt_st, gross_debt_lt, cash):
        return Metric(None, Status.INDISPONIVEL)
    st_inv = st_investments or 0.0
    value = gross_debt_st + gross_debt_lt - cash - st_inv
    return Metric(
        value, Status.OK, unit="BRL",
        formula="divida_cp+divida_lp-caixa-aplic_cp",
    )


def net_debt_to_ebitda(nd: Metric, ebitda_ltm: float | None, is_bank: bool = False) -> Metric:
    if is_bank:
        return Metric(
            None, Status.NAO_APLICAVEL,
            note="métrica não se aplica a instituições financeiras",
        )
    if not nd.ok or ebitda_ltm is None:
        return Metric(None, Status.INDISPONIVEL)
    if ebitda_ltm <= 0:
        return Metric(None, Status.NAO_APLICAVEL, note="EBITDA LTM <= 0")
    return Metric(nd.value / ebitda_ltm, Status.OK, unit="x", formula="divida_liquida/ebitda_ltm")


def cagr(first: float | None, last: float | None, years: float) -> Metric:
    """CAGR somente com extremos positivos e comparáveis.

    Prejuízo/zero/base distorcida => SERIE_NAO_COMPARAVEL (exibir evolução anual
    em vez de taxa composta). `years` = número de intervalos anuais.
    """
    if _missing(first, last):
        return Metric(None, Status.DADO_INSUFICIENTE)
    if years <= 0:
        return Metric(None, Status.DADO_INSUFICIENTE, note="período inválido")
    if first <= 0 or last <= 0:
        note = "extremo não positivo: turnaround/inflexão — usar evolução anual"
        status = Status.TURNAROUND if last > 0 >= first else Status.SERIE_NAO_COMPARAVEL
        return Metric(None, status, note=note)
    return Metric(
        (last / first) ** (1.0 / years) - 1.0, Status.OK, unit="fração a.a.",
        formula="(fim/inicio)^(1/anos)-1",
    )


def cash_conversion(cfo_ltm: float | None, net_income_ltm: float | None) -> Metric:
    if _missing(cfo_ltm, net_income_ltm):
        return Metric(None, Status.INDISPONIVEL)
    if net_income_ltm <= 0:
        return Metric(None, Status.NAO_APLICAVEL, note="lucro <= 0")
    return Metric(cfo_ltm / net_income_ltm, Status.OK, unit="x", formula="cfo_ltm/lucro_ltm")


def fcf_proxy(cfo: float | None, capex_total: float | None) -> Metric:
    """FCF proxy = CFO - CAPEX total (rotulado PROXY; não é owner earnings)."""
    if _missing(cfo, capex_total):
        return Metric(None, Status.INDISPONIVEL)
    return Metric(
        cfo - abs(capex_total), Status.OK, unit="BRL",
        formula="cfo-capex_total", note="FCF_PROXY: capex total, não de manutenção",
    )
