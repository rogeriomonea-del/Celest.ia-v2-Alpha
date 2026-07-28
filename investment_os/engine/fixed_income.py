"""Renda fixa: fluxo de NTN-B, duration, DV01, convexidade e cenários MTM.

Convenções (docs/ASSUMPTIONS.md):
- Tesouro IPCA+ (sem juros semestrais): zero-coupon em termos REAIS, VNA=100
  base nominal 1000 no vencimento (trabalhamos em termos reais: fluxo único de
  principal).
- Tesouro IPCA+ com Juros Semestrais (NTN-B): cupom real de 6% a.a. pago
  semestralmente ((1.06)^0.5-1 por semestre sobre o nominal), principal no
  vencimento.
- Taxas do Tesouro Direto: convenção de mercado brasileira, capitalização
  anual composta em dias úteis/252. Aproximação do MVP: contagem ACT/365.25
  para prazos (documentada; erro < 1 dia útil em prazos longos).
Tudo em termos REAIS (a inflação corrige nominal e fluxos igualmente).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

NOTIONAL = 1000.0
COUPON_RATE_SEMI = 1.06**0.5 - 1.0  # cupom real NTN-B por semestre


def _year_fraction(start: date, end: date) -> float:
    return (end - start).days / 365.25


def ntnb_cashflows(settle: date, maturity: date, with_coupons: bool) -> list[tuple[date, float]]:
    """Fluxos reais futuros (data, valor) de um título IPCA+ do Tesouro."""
    if maturity <= settle:
        raise ValueError("vencimento no passado")
    flows: list[tuple[date, float]] = []
    if with_coupons:
        # Cupons semestrais ancorados na data de vencimento, retrocedendo.
        d = maturity
        dates: list[date] = []
        while d > settle:
            dates.append(d)
            month = d.month - 6
            year = d.year
            if month <= 0:
                month += 12
                year -= 1
            day = min(d.day, 28) if month == 2 else d.day
            d = date(year, month, day)
        for cd in sorted(dates):
            flows.append((cd, NOTIONAL * COUPON_RATE_SEMI))
    flows.append((maturity, NOTIONAL))
    return flows


def price_from_yield(settle: date, maturity: date, yield_pct: float, with_coupons: bool) -> float:
    """PU real a partir da taxa real anual (% a.a., composta anualmente)."""
    y = yield_pct / 100.0
    return sum(
        cf / (1.0 + y) ** _year_fraction(settle, d)
        for d, cf in ntnb_cashflows(settle, maturity, with_coupons)
    )


@dataclass(frozen=True)
class RiskProfile:
    price: float
    macaulay_duration_years: float
    modified_duration_years: float
    dv01_brl: float
    convexity: float


def risk_profile(settle: date, maturity: date, yield_pct: float, with_coupons: bool) -> RiskProfile:
    y = yield_pct / 100.0
    flows = ntnb_cashflows(settle, maturity, with_coupons)
    price = sum(cf / (1.0 + y) ** _year_fraction(settle, d) for d, cf in flows)
    weighted_t = sum(
        _year_fraction(settle, d) * cf / (1.0 + y) ** _year_fraction(settle, d)
        for d, cf in flows
    )
    macaulay = weighted_t / price
    modified = macaulay / (1.0 + y)

    bump = 0.0001  # 1 bp
    p_up = price_from_yield(settle, maturity, (y + bump) * 100, with_coupons)
    p_dn = price_from_yield(settle, maturity, (y - bump) * 100, with_coupons)
    dv01 = (p_dn - p_up) / 2.0
    convexity = (p_up + p_dn - 2.0 * price) / (price * bump**2)
    return RiskProfile(price, macaulay, modified, dv01, convexity)


def mtm_scenarios(
    settle: date, maturity: date, yield_pct: float, with_coupons: bool,
    shocks_bps: tuple[int, ...] = (-200, -150, -100, -50, 50, 100, 150, 200),
) -> list[dict]:
    """Reprecificação para choques paralelos na taxa real.

    Decompõe o efeito em duration (1ª ordem) e convexidade (2ª ordem) e mostra o
    resíduo da reprecificação exata.
    """
    base = risk_profile(settle, maturity, yield_pct, with_coupons)
    out = []
    for bps in shocks_bps:
        dy = bps / 10000.0
        exact = price_from_yield(settle, maturity, yield_pct + bps / 100.0, with_coupons)
        duration_effect = -base.modified_duration_years * dy * base.price
        convexity_effect = 0.5 * base.convexity * dy**2 * base.price
        out.append(
            {
                "choque_bps": bps,
                "taxa_pct": round(yield_pct + bps / 100.0, 4),
                "pu_novo": round(exact, 2),
                "variacao_pct": round((exact / base.price - 1.0) * 100, 2),
                "efeito_duration_brl": round(duration_effect, 2),
                "efeito_convexidade_brl": round(convexity_effect, 2),
                "residuo_brl": round(exact - base.price - duration_effect - convexity_effect, 2),
            }
        )
    return out
