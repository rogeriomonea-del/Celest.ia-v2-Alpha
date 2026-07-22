"""Aprendizado de estratégia de scraping (self-improvement).

Toda tentativa de scraping registra em ``data/strategy_performance.csv``:
qual estratégia, em qual site, se deu certo, quantas ofertas trouxe e quanto
demorou. Antes de cada busca, ``rank_strategies`` lê esse histórico e ordena
as estratégias pela taxa de sucesso (suavizada), de forma que:

* estratégias comprovadamente boas são tentadas primeiro (exploração → exploração);
* estratégias ainda não testadas recebem um prior neutro (0.5), então são
  experimentadas antes das que já se mostraram ruins (< 0.5) — exploração natural,
  sem aleatoriedade (determinístico, testável).

É o "processo salvo dos resultados anteriores" que o orquestrador consulta para
melhorar sozinho a cada rodada.
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from ..config import Settings
from .csvio import READ_ERRORS, append_rows, read_rows

#: janela de recência por site: só as últimas N tentativas contam no score —
#: um histórico vitalício não pode ancorar o ranking em desempenho antigo.
_SCORE_TAIL_ROWS = 1000

STRATEGY_FIELDS = [
    "timestamp_utc",
    "site",
    "strategy",
    "outcome",       # success | fail
    "offers_found",
    "duration_s",
]

#: prior neutro para estratégias sem histórico (Laplace: (s+1)/(n+2))
_PRIOR = 0.5


def record_attempt(
    settings: Settings,
    *,
    site: str,
    strategy: str,
    success: bool,
    offers_found: int,
    duration_s: float,
) -> None:
    """Append best-effort — nunca deixa a busca quebrar por causa de I/O."""
    path = Path(settings.strategy_csv)
    try:
        append_rows(
            path,
            STRATEGY_FIELDS,
            [
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "site": site,
                    "strategy": strategy,
                    "outcome": "success" if success else "fail",
                    "offers_found": offers_found,
                    "duration_s": round(duration_s, 2),
                }
            ],
        )
    except OSError:
        return


def _load_scores(settings: Settings, site: str) -> dict[str, float]:
    """Score suavizado por estratégia para um site: (sucessos+1)/(tentativas+2)."""
    path = Path(settings.strategy_csv)
    if not path.is_file():
        return {}
    successes: dict[str, int] = defaultdict(int)
    totals: dict[str, int] = defaultdict(int)
    try:
        # filtra por site DURANTE o streaming e guarda só a cauda recente:
        # memória limitada e o score reflete o desempenho atual do site
        recent = deque(
            (row for row in read_rows(path) if row.get("site") == site),
            maxlen=_SCORE_TAIL_ROWS,
        )
    except READ_ERRORS:
        return {}
    for row in recent:
        strategy = row.get("strategy") or ""
        if not strategy:
            continue
        totals[strategy] += 1
        if row.get("outcome") == "success":
            successes[strategy] += 1
    return {
        strategy: (successes[strategy] + 1) / (totals[strategy] + 2)
        for strategy in totals
    }


def rank_strategies(settings: Settings, site: str, strategies: list[str]) -> list[str]:
    """Ordena as estratégias por desempenho histórico no site (desc).

    Preserva a ordem-base como desempate; estratégias sem histórico usam o
    prior neutro, ficando à frente das comprovadamente ruins.
    """
    scores = _load_scores(settings, site)
    base_order = {name: index for index, name in enumerate(strategies)}
    return sorted(
        strategies,
        key=lambda s: (-scores.get(s, _PRIOR), base_order[s]),
    )


def performance_summary(settings: Settings) -> dict[str, dict[str, float]]:
    """{site: {strategy: score}} — usado pelo CLI `strategies`."""
    path = Path(settings.strategy_csv)
    if not path.is_file():
        return {}
    sites: set[str] = set()
    try:
        for row in read_rows(path):
            if row.get("site"):
                sites.add(row["site"])
    except READ_ERRORS:
        return {}
    return {site: _load_scores(settings, site) for site in sorted(sites)}
