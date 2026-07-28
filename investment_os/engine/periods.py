"""Períodos contábeis: trimestres isolados a partir de acumulados e TTM.

DRE/DFC de ITR podem vir acumuladas no ano (YTD). Antes de qualquer TTM é
obrigatório converter para trimestres isolados (docs/METRIC_REGISTRY.md).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class PeriodValue:
    start: date
    end: date
    value: float

    @property
    def months(self) -> int:
        return (self.end.year - self.start.year) * 12 + self.end.month - self.start.month + 1


def isolate_quarters(periods: list[PeriodValue]) -> list[PeriodValue]:
    """Converte uma lista de períodos (trimestres e/ou YTD) em trimestres isolados.

    Estratégia determinística por ano fiscal (assumindo ano-calendário):
    - períodos de ~3 meses entram diretamente;
    - períodos YTD (6/9/12 meses iniciando no início do ano) geram o trimestre
      final por diferença com o YTD imediatamente anterior, quando disponível.
    Duplicatas do mesmo trimestre são deduplicadas (preferência ao isolado).
    """
    by_quarter: dict[tuple[date, date], float] = {}
    ytd = sorted(
        (p for p in periods if p.start.month == 1 and p.months in (6, 9, 12)),
        key=lambda p: (p.start.year, p.months),
    )
    for p in periods:
        if p.months == 3:
            by_quarter[(p.start, p.end)] = p.value
    for p in ytd:
        prev_months = p.months - 3
        prev = next(
            (q for q in ytd if q.start == p.start and q.months == prev_months), None
        )
        q_start = date(p.end.year, p.end.month - 2, 1)
        key = (q_start, p.end)
        if key in by_quarter:
            continue
        if prev is not None:
            by_quarter[key] = p.value - prev.value
        elif p.months == 3:  # inatingível aqui, YTD >= 6; guarda defensiva
            by_quarter[key] = p.value
    return [
        PeriodValue(s, e, v) for (s, e), v in sorted(by_quarter.items(), key=lambda kv: kv[0][1])
    ]


def ttm(
    annual: PeriodValue | None, quarters: list[PeriodValue]
) -> tuple[float | None, str]:
    """TTM = último anual + trimestres posteriores - trimestres homólogos.

    Retorna (valor, descrição do período). Se não houver trimestres além do
    anual, TTM = último exercício anual. Se faltar trimestre homólogo do ano
    anterior, retorna (None, motivo) — nunca soma períodos incomparáveis.
    """
    if annual is None:
        return None, "sem exercício anual de referência"
    after = [q for q in quarters if q.end > annual.end]
    if not after:
        return annual.value, f"exercício {annual.start.isoformat()}..{annual.end.isoformat()}"
    total = annual.value
    desc_parts = [f"anual {annual.end.year}"]
    for q in sorted(after, key=lambda p: p.end):
        prior = next(
            (
                p
                for p in quarters
                if p.start.month == q.start.month
                and p.end.month == q.end.month
                and p.end.year == q.end.year - 1
            ),
            None,
        )
        if prior is None:
            return None, (
                f"trimestre homólogo de {q.start.isoformat()}..{q.end.isoformat()} "
                "indisponível — TTM não computável"
            )
        total += q.value - prior.value
        desc_parts.append(f"+{q.end.year}T{(q.end.month + 2) // 3}-{q.end.year - 1}T{(q.end.month + 2) // 3}")
    return total, " ".join(desc_parts)
