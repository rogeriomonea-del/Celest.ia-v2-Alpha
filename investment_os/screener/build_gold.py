"""Camada gold: indicadores por companhia a partir de silver (CVM + B3).

Cada valor carrega status explícito e período; "indisponível" nunca vira 0.
Bancos/seguradoras usam template contábil próprio: PL e lucro são localizados
por CONCEITO (descrição da conta), não por código fixo. A escala da composição
de capital (unidades vs milhares — inconsistente no dataset CVM) é resolvida
com validação cruzada contra o lucro por ação (conta 3.99); sem validação
possível, o valor de mercado fica INDISPONIVEL (nunca um palpite silencioso).
"""
from __future__ import annotations

import math
import re
from datetime import date

import pandas as pd

from ..engine import metrics as M
from ..engine.periods import PeriodValue, isolate_quarters, ttm

_FINANCIAL_SECTOR_RE = re.compile(r"bancos|intermedia|seguradora|seguros", re.IGNORECASE)
_DA_RE = re.compile(r"deprecia|amortiza", re.IGNORECASE)
_CAPEX_RE = re.compile(r"imobilizad|intang[ií]vel", re.IGNORECASE)


def _to_date(s) -> date | None:
    if s is None or pd.isna(s):
        return None
    return date.fromisoformat(str(s)[:10])


def _periods(rows: pd.DataFrame) -> list[PeriodValue]:
    out = []
    for _, r in rows.iterrows():
        start, end = _to_date(r["dt_ini_exerc"]), _to_date(r["dt_fim_exerc"])
        if start and end and pd.notna(r["valor"]):
            out.append(PeriodValue(start, end, float(r["valor"])))
    return out


class CompanyFacts:
    """Fatia de fatos de uma companhia, com acessores determinísticos."""

    def __init__(self, facts: pd.DataFrame):
        self.f = facts

    def _sel(self, doc: str, grupo: str, cd_conta: str | None = None,
             concept: str | None = None, ds_re: re.Pattern | None = None,
             prefix: str | None = None) -> pd.DataFrame:
        df = self.f[(self.f["doc_type"] == doc) & (self.f["grupo"] == grupo)]
        if cd_conta is not None:
            df = df[df["cd_conta"] == cd_conta]
        if concept is not None:
            df = df[df["concept"] == concept]
        if prefix is not None:
            df = df[df["cd_conta"].str.startswith(prefix)]
        if ds_re is not None:
            df = df[df["ds_conta"].str.contains(ds_re, na=False)]
        return df

    def _ultimo(self, df: pd.DataFrame) -> pd.DataFrame:
        return df[df["ordem_exerc"].str.upper().str.startswith("ÚLT")]

    def annual_series(self, grupo: str, *, cd_conta: str | None = None,
                      concept: str | None = None, agg: bool = False,
                      ds_re: re.Pattern | None = None, prefix: str | None = None) -> dict[int, float]:
        """Série anual as-reported: valor do exercício ÚLTIMO de cada DFP."""
        df = self._ultimo(self._sel("DFP", grupo, cd_conta, concept, ds_re, prefix))
        out: dict[int, float] = {}
        for _, r in df.iterrows():
            end = _to_date(r["dt_fim_exerc"])
            if end is not None and pd.notna(r["valor"]):
                v = float(r["valor"])
                out[end.year] = out.get(end.year, 0.0) + v if agg else v
        return out

    def quarters(self, grupo: str, *, cd_conta: str | None = None,
                 concept: str | None = None) -> list[PeriodValue]:
        df = self._ultimo(self._sel("ITR", grupo, cd_conta, concept))
        return isolate_quarters(_periods(df))

    def balance_latest(self, grupo: str, *, cd_conta: str | None = None,
                       concept: str | None = None, agg: bool = False) -> tuple[float | None, date | None]:
        df = pd.concat(
            [self._ultimo(self._sel(d, grupo, cd_conta, concept)) for d in ("DFP", "ITR")]
        )
        if df.empty:
            return None, None
        df = df.assign(_end=df["dt_fim_exerc"].map(_to_date))
        last_end = df["_end"].max()
        sel = df[df["_end"] == last_end].drop_duplicates(subset=["cd_conta"])
        if sel.empty or sel["valor"].isna().all():
            return None, last_end
        value = float(sel["valor"].sum()) if agg else float(sel["valor"].iloc[0])
        return value, last_end

    def balance_at_year_end(self, grupo: str, year: int, *, cd_conta: str | None = None,
                            concept: str | None = None, agg: bool = False) -> float | None:
        df = self._ultimo(self._sel("DFP", grupo, cd_conta, concept))
        df = df[df["dt_fim_exerc"].astype(str).str.startswith(str(year))]
        df = df.drop_duplicates(subset=["cd_conta"])
        if df.empty or df["valor"].isna().all():
            return None
        return float(df["valor"].sum()) if agg else float(df["valor"].iloc[0])

    def ltm(self, grupo: str, *, cd_conta: str | None = None,
            concept: str | None = None) -> tuple[float | None, str]:
        annuals = self._ultimo(self._sel("DFP", grupo, cd_conta, concept))
        periods = _periods(annuals)
        if not periods:
            return None, "sem exercício anual"
        last_annual = max(periods, key=lambda p: p.end)
        return ttm(last_annual, self.quarters(grupo, cd_conta=cd_conta, concept=concept))


def equity_attributable_latest(cf: CompanyFacts) -> tuple[float | None, date | None]:
    total, end = cf.balance_latest("BPP", concept="equity_total")
    if total is None:
        return None, end
    nci, nci_end = cf.balance_latest("BPP", concept="equity_nci", agg=True)
    if nci is not None and nci_end == end:
        return total - nci, end
    return total, end  # sem NCI reportada: PL consolidado = atribuível


def equity_attributable_at(cf: CompanyFacts, year: int) -> float | None:
    total = cf.balance_at_year_end("BPP", year, concept="equity_total")
    if total is None:
        return None
    nci = cf.balance_at_year_end("BPP", year, concept="equity_nci", agg=True)
    return total - nci if nci is not None else total


def resolve_share_scale(
    total_shares_raw: float, ni_annual: float | None, eps_on: float | None,
    equity: float | None,
) -> tuple[float | None, str]:
    """Resolve a escala (1 ou 1000) da composição de capital da CVM.

    1º critério: ações implícitas = lucro anual / LPA básico ON (conta 3.99);
    2º critério (fallback): plausibilidade do VPA por ação (0,05..1.000 R$).
    Sem validação inequívoca -> None (valor de mercado INDISPONIVEL).
    """
    if total_shares_raw <= 0:
        return None, "composição de capital ausente ou nula"
    if ni_annual is not None and eps_on not in (None, 0) and ni_annual != 0:
        implied = abs(ni_annual / eps_on)
        best = min((1.0, 1000.0), key=lambda s: abs(math.log(total_shares_raw * s / implied)))
        ratio = total_shares_raw * best / implied
        if 0.2 <= ratio <= 5.0:
            return best, f"escala x{best:.0f} validada por LPA (razão {ratio:.2f})"
        return None, f"escala não validável por LPA (razão {ratio:.2f})"
    if equity is not None and equity > 0:
        plausible = [
            s for s in (1.0, 1000.0) if 0.05 <= equity / (total_shares_raw * s) <= 1000.0
        ]
        if len(plausible) == 1:
            return plausible[0], f"escala x{plausible[0]:.0f} por plausibilidade do VPA"
        return None, "escala ambígua (sem LPA para desempate)"
    return None, "sem LPA nem PL para validar escala"


def build_company_row(
    cd_cvm: str, facts: pd.DataFrame, cadastro_row: pd.Series | None,
    prices_by_class: dict[str, float | None], price_date: date | None,
    shares: pd.Series | None, liquidity_63d: float | None,
    tickers: list[str],
) -> dict:
    cf = CompanyFacts(facts)
    setor = str(cadastro_row["SETOR_ATIV"]) if cadastro_row is not None else ""
    is_financial = bool(_FINANCIAL_SECTOR_RE.search(setor or ""))

    revenue_a = cf.annual_series("DRE", cd_conta="3.01")
    ni_attrib_a = cf.annual_series("DRE", concept="net_income_attrib")
    ni_note = ""
    if not ni_attrib_a:
        ni_attrib_a = cf.annual_series("DRE", concept="net_income_total")
        ni_note = "lucro consolidado total (linha atribuível indisponível)"
    ebit_a = cf.annual_series("DRE", cd_conta="3.05")
    cfo_a = cf.annual_series("DFC_MI", cd_conta="6.01")
    capex_a = cf.annual_series("DFC_MI", ds_re=_CAPEX_RE, prefix="6.02", agg=True)
    da_a = cf.annual_series("DFC_MI", ds_re=_DA_RE, prefix="6.01", agg=True)
    eps_a = cf.annual_series("DRE", concept="eps_on")

    years = sorted(set(revenue_a) | set(ni_attrib_a))[-5:]

    ni_ltm, ni_ltm_desc = cf.ltm("DRE", concept="net_income_attrib")
    if ni_ltm is None:
        ni_ltm, ni_ltm_desc = cf.ltm("DRE", concept="net_income_total")
    rev_ltm, rev_ltm_desc = cf.ltm("DRE", cd_conta="3.01")
    cfo_ltm, _ = cf.ltm("DFC_MI", cd_conta="6.01")
    ebit_ltm, _ = cf.ltm("DRE", cd_conta="3.05")

    equity_now, equity_dt = equity_attributable_latest(cf)

    # Escala da composição de capital validada por LPA do último exercício.
    shares_by_class: dict[str, float | None] = {}
    scale_note = "sem composição de capital"
    if shares is not None:
        raw_on = float(shares["shares_on"]) if pd.notna(shares["shares_on"]) else 0.0
        raw_pn = float(shares["shares_pn"]) if pd.notna(shares["shares_pn"]) else 0.0
        last_ni_year = max((y for y in ni_attrib_a), default=None)
        scale, scale_note = resolve_share_scale(
            raw_on + raw_pn,
            ni_attrib_a.get(last_ni_year) if last_ni_year else None,
            eps_a.get(last_ni_year) if last_ni_year else None,
            equity_now,
        )
        if scale is not None:
            shares_by_class = {"ON": raw_on * scale, "PN": raw_pn * scale}
    mcap = M.market_cap(prices_by_class, shares_by_class)
    if not mcap.ok and scale_note:
        mcap = M.Metric(None, mcap.status, note=f"{mcap.note or ''} | capital: {scale_note}".strip(" |"))

    pe = M.price_earnings(mcap, ni_ltm)
    pvpa = M.price_to_book(mcap, equity_now)

    equity_prev = equity_attributable_at(cf, (equity_dt.year - 1) if equity_dt else 0)
    roe = M.roe_ltm(ni_ltm, equity_prev, equity_now)

    annual_roe: list[float | None] = []
    for y in years:
        e0, e1 = equity_attributable_at(cf, y - 1), equity_attributable_at(cf, y)
        r = M.roe_ltm(ni_attrib_a.get(y), e0, e1)
        annual_roe.append(r.value if r.ok else None)
    roe_med5 = M.roe_median_5y(annual_roe)

    debt_st, _ = cf.balance_latest("BPP", cd_conta="2.01.04")
    debt_lt, _ = cf.balance_latest("BPP", cd_conta="2.02.01")
    cash, _ = cf.balance_latest("BPA", cd_conta="1.01.01")
    st_inv, _ = cf.balance_latest("BPA", cd_conta="1.01.02")
    nd = M.net_debt(debt_st, debt_lt, cash, st_inv)

    da_ltm = da_a.get(max(da_a)) if da_a else None
    ebitda_ltm = (ebit_ltm + da_ltm) if (ebit_ltm is not None and da_ltm is not None) else None
    if is_financial:
        nd = M.Metric(None, M.Status.NAO_APLICAVEL, note="instituição financeira")
        ebitda_ltm = None
    nd_ebitda = M.net_debt_to_ebitda(nd, ebitda_ltm, is_bank=is_financial)

    n_years = len(years) - 1 if len(years) >= 2 else 0
    insuf = M.Metric(None, M.Status.DADO_INSUFICIENTE, note=f"apenas {len(years)} exercícios")
    rev_cagr = M.cagr(revenue_a.get(years[0]) if years else None,
                      revenue_a.get(years[-1]) if years else None, n_years) if n_years >= 4 else insuf
    ni_cagr = M.cagr(ni_attrib_a.get(years[0]) if years else None,
                     ni_attrib_a.get(years[-1]) if years else None, n_years) if n_years >= 4 else insuf

    fcf_by_year = {y: (cfo_a[y] - abs(capex_a[y])) for y in cfo_a if y in capex_a}
    cfo_pos = sum(1 for y in years if cfo_a.get(y) is not None and cfo_a[y] > 0)
    fcf_pos = sum(1 for y in years if y in fcf_by_year and fcf_by_year[y] > 0)
    ni_pos_all = all(ni_attrib_a.get(y, -1) > 0 for y in years) if years else False
    rev_declines = [
        revenue_a[y] / revenue_a[y - 1] - 1
        for y in years
        if y in revenue_a and (y - 1) in revenue_a and revenue_a[y - 1] > 0
    ]
    worst_rev_decline = min(rev_declines) if rev_declines else None

    cash_conv = M.cash_conversion(cfo_ltm, ni_ltm)

    last_stmt = facts.assign(_end=facts["dt_fim_exerc"].map(_to_date))["_end"].max()
    dt_receb = facts["dt_receb"].dropna().max() if "dt_receb" in facts else None

    return {
        "cd_cvm": cd_cvm,
        "empresa": facts["denom_cia"].iloc[0],
        "cnpj": facts["cnpj"].iloc[0],
        "setor": setor,
        "is_financial": is_financial,
        "tickers": ",".join(tickers),
        "preco_data": price_date.isoformat() if price_date else None,
        "precos": {k: v for k, v in prices_by_class.items() if v is not None},
        "liquidez_media_63d_brl": liquidity_63d,
        "capital_scale_note": scale_note,
        "market_cap": mcap,
        "pe": pe,
        "pvpa": pvpa,
        "roe_ltm": roe,
        "roe_med5": roe_med5,
        "nd_ebitda": nd_ebitda,
        "rev_cagr5": rev_cagr,
        "ni_cagr5": ni_cagr,
        "cash_conv": cash_conv,
        "ni_ltm": ni_ltm,
        "ni_ltm_period": ni_ltm_desc,
        "rev_ltm": rev_ltm,
        "rev_ltm_period": rev_ltm_desc,
        "ni_note": ni_note,
        "anos_serie": years,
        "receita_anual": {y: revenue_a.get(y) for y in years},
        "lucro_anual": {y: ni_attrib_a.get(y) for y in years},
        "fcf_anual": {y: fcf_by_year.get(y) for y in years},
        "cfo_positivo_5a": cfo_pos,
        "fcf_positivo_5a": fcf_pos,
        "lucro_positivo_todos_5a": ni_pos_all,
        "pior_queda_receita": worst_rev_decline,
        "ultima_demonstracao": last_stmt.isoformat() if last_stmt else None,
        "dt_receb_ultimo_doc": str(dt_receb)[:10] if dt_receb is not None else None,
    }
