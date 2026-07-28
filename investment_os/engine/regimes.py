"""Classificação determinística de regimes macro (Brasil) com confiança.

Funções puras sobre séries [(data, valor)]. Regras simples, documentadas e
testadas — sem rumor, sem opinião. Dimensão sem dado suficiente retorna
estado INDISPONIVEL (nunca um palpite). Expectativas Focus são sempre
rotuladas EXPECTATIVA DE MERCADO, não fato.

PREMISSA (docs/ASSUMPTIONS.md): meta de inflação de referência 3,00% a.a. com
tolerância de 1,5 p.p. (CMN) — parametrizável.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date, timedelta

META_IPCA_PCT = 3.0
TOLERANCIA_IPCA_PP = 1.5

Serie = list[tuple[date, float]]


@dataclass
class Regime:
    dimensao: str
    estado: str
    detalhe: str
    confianca: str  # ALTA | MEDIA | BAIXA | INDISPONIVEL
    data_base: str | None
    fonte: str
    natureza: str = "FATO VERIFICADO + INFERÊNCIA DO SISTEMA (regra documentada)"

    def to_dict(self) -> dict:
        return asdict(self)


def _staleness_conf(last: date, today: date, max_days_alta: int, max_days_media: int) -> str:
    age = (today - last).days
    if age <= max_days_alta:
        return "ALTA"
    if age <= max_days_media:
        return "MEDIA"
    return "BAIXA"


def _indisponivel(dim: str, motivo: str) -> Regime:
    return Regime(dim, "INDISPONIVEL", motivo, "INDISPONIVEL", None, "—",
                  natureza="DADO AUSENTE")


def _acum(values: list[float]) -> float:
    """Acumulado composto de variações percentuais mensais."""
    acc = 1.0
    for v in values:
        acc *= 1.0 + v / 100.0
    return (acc - 1.0) * 100.0


def inflacao(ipca_mensal: Serie, *, today: date) -> Regime:
    if len(ipca_mensal) < 15:
        return _indisponivel("inflacao", "menos de 15 meses de IPCA disponíveis")
    srt = sorted(ipca_mensal)
    last_date = srt[-1][0]
    vals = [v for _, v in srt]
    # anualização GEOMÉTRICA do trimestre: (1+acum3m)^4 - 1
    m3_anualizado = ((1.0 + _acum(vals[-3:]) / 100.0) ** 4 - 1.0) * 100.0
    m12 = _acum(vals[-12:])
    prev_m12 = _acum(vals[-15:-3][-12:])
    if m3_anualizado > m12 + 0.5 and m12 >= prev_m12:
        estado = "acelerando"
    elif m3_anualizado < m12 - 0.5:
        estado = "desacelerando"
    else:
        estado = "estavel"
    dentro = abs(m12 - META_IPCA_PCT) <= TOLERANCIA_IPCA_PP
    return Regime(
        "inflacao", estado,
        f"IPCA 12m {m12:.2f}%; 3m anualizado {m3_anualizado:.2f}%; "
        f"{'dentro' if dentro else 'fora'} da banda da meta ({META_IPCA_PCT:.1f}±{TOLERANCIA_IPCA_PP:.1f}) [premissa]",
        _staleness_conf(last_date, today, 45, 75), last_date.isoformat(), "bcb_sgs:433 (IBGE)",
    )


def politica_monetaria(selic_meta: Serie, *, today: date) -> Regime:
    if len(selic_meta) < 2:
        return _indisponivel("politica_monetaria", "série da meta Selic insuficiente")
    srt = sorted(selic_meta)
    last_date, last = srt[-1]
    seis_meses = last_date - timedelta(days=182)
    past = [v for d, v in srt if d <= seis_meses]
    if not past:
        return _indisponivel("politica_monetaria", "sem histórico de 6 meses da meta Selic")
    ref = past[-1]
    estado = "apertando" if last > ref + 1e-9 else "afrouxando" if last < ref - 1e-9 else "estavel"
    return Regime(
        "politica_monetaria", estado,
        f"meta Selic {last:.2f}% a.a. vs {ref:.2f}% há ~6 meses",
        _staleness_conf(last_date, today, 10, 30), last_date.isoformat(), "bcb_sgs:432",
    )


def atividade(ibc_br: Serie, *, today: date) -> Regime:
    """PRÉ-CONDIÇÃO: a série DEVE ser o IBC-Br COM ajuste sazonal (SGS 24364).
    A regra 3m vs 3m anteriores não dessazonaliza — com a série bruta (24363)
    o resultado seria artefato sazonal (achado bloqueante da auditoria F6)."""
    if len(ibc_br) < 7:
        return _indisponivel("atividade", "IBC-Br com menos de 7 meses")
    srt = sorted(ibc_br)
    last_date = srt[-1][0]
    vals = [v for _, v in srt]
    m3 = sum(vals[-3:]) / 3
    m3_prev = sum(vals[-6:-3]) / 3
    delta = (m3 / m3_prev - 1) * 100 if m3_prev else 0.0
    estado = "acelerando" if delta > 0.15 else "desacelerando" if delta < -0.15 else "estavel"
    return Regime(
        "atividade", estado,
        f"IBC-Br com ajuste sazonal: média 3m {m3:.1f} vs 3m anteriores {m3_prev:.1f} ({delta:+.2f}%)",
        _staleness_conf(last_date, today, 75, 120), last_date.isoformat(), "bcb_sgs:24364",
    )


def cambio(ptax: Serie, *, today: date) -> Regime:
    if len(ptax) < 60:
        return _indisponivel("cambio", "PTAX com menos de 60 pregões")
    srt = sorted(ptax)
    last_date, last = srt[-1]
    ano = [v for d, v in srt if d >= last_date - timedelta(days=365)]
    media = sum(ano) / len(ano)
    desvio = (sum((v - media) ** 2 for v in ano) / len(ano)) ** 0.5
    if last > media + desvio:
        estado = "real_fraco"
    elif last < media - desvio:
        estado = "real_forte"
    else:
        estado = "neutro"
    return Regime(
        "cambio", estado,
        f"PTAX {last:.2f} vs média 12m {media:.2f} (±{desvio:.2f})",
        _staleness_conf(last_date, today, 5, 15), last_date.isoformat(), "bcb_sgs:1",
    )


def risco_fiscal(divida_pib: Serie, *, today: date) -> Regime:
    if len(divida_pib) < 13:
        return _indisponivel("risco_fiscal", "dívida bruta/PIB com menos de 13 meses")
    srt = sorted(divida_pib)
    last_date, last = srt[-1]
    ref = [v for d, v in srt if d <= last_date - timedelta(days=365)]
    prev = ref[-1] if ref else None
    if prev is None:
        return _indisponivel("risco_fiscal", "sem base de 12 meses para comparação")
    delta = last - prev
    estado = "aumentando" if delta > 0.5 else "reduzindo" if delta < -0.5 else "estavel"
    return Regime(
        "risco_fiscal", estado,
        f"dívida bruta/PIB {round(last,1):.1f}% vs {round(prev,1):.1f}% há 12m ({round(last,1)-round(prev,1):+.1f} p.p.)",
        _staleness_conf(last_date, today, 75, 120), last_date.isoformat(), "bcb_sgs:13762",
    )


def expectativas_inflacao(focus_ipca_median_next_year: float | None, data_pesquisa: str | None,
                          *, today: date | None = None) -> Regime:
    if focus_ipca_median_next_year is None:
        return _indisponivel("expectativas_inflacao", "Focus indisponível nesta ingestão")
    ancorada = abs(focus_ipca_median_next_year - META_IPCA_PCT) <= TOLERANCIA_IPCA_PP
    conf = "MEDIA"
    if today is not None and data_pesquisa:
        try:
            conf = _staleness_conf(date.fromisoformat(str(data_pesquisa)[:10]), today, 21, 45)
        except ValueError:
            pass
    return Regime(
        "expectativas_inflacao",
        "ancoradas" if ancorada else "desancoradas",
        f"mediana Focus IPCA ano seguinte: {focus_ipca_median_next_year:.2f}% vs meta "
        f"{META_IPCA_PCT:.1f}±{TOLERANCIA_IPCA_PP:.1f} [premissa]",
        conf, data_pesquisa, "bcb_focus",
        natureza="EXPECTATIVA DE MERCADO (Focus) — não é fato nem previsão do sistema",
    )
