"""Memória de falhas por rota (self-improvement).

Além do placar geral por site (``strategy_performance.csv``), o sistema grava
CADA desfecho por (site, estratégia, ROTA) em ``data/search_failures.csv`` —
inclusive o texto do erro. Antes de uma nova busca, estratégias com uma
sequência de falhas naquela rota específica são **rebaixadas para o fim da
fila** (nunca banidas: continuam como último recurso, e um sucesso zera a
sequência). É a parte de "fails" do CSV de aprendizado: o sistema não insiste
primeiro no que acabou de falhar.
"""

from __future__ import annotations

import csv
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from ..config import Settings

FAILURE_FIELDS = [
    "timestamp_utc",
    "site",
    "strategy",
    "route",
    "depart",
    "outcome",   # success | fail
    "error",
]

#: falhas seguidas (sem sucesso no meio) que rebaixam a estratégia na rota
FAILURE_DEMOTE_STREAK = 3
#: quantas linhas recentes considerar (evita ler CSVs gigantes inteiros)
_TAIL_ROWS = 500


def _failures_path(settings: Settings) -> Path:
    return Path(settings.strategy_csv).parent / "search_failures.csv"


def record_route_outcome(
    settings: Settings,
    *,
    site: str,
    strategy: str,
    route: str,
    depart: str,
    success: bool,
    error: str = "",
) -> None:
    """Append best-effort — I/O nunca quebra a busca."""
    path = _failures_path(settings)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        is_new = not path.exists()
        with path.open("a", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FAILURE_FIELDS)
            if is_new:
                writer.writeheader()
            writer.writerow(
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "site": site,
                    "strategy": strategy,
                    "route": route,
                    "depart": depart,
                    "outcome": "success" if success else "fail",
                    "error": (error or "")[:200],
                }
            )
    except OSError:
        return


def failure_streaks(settings: Settings, site: str, route: str) -> dict[str, int]:
    """{estratégia: falhas seguidas desde o último sucesso} para (site, rota)."""
    path = _failures_path(settings)
    if not path.is_file():
        return {}
    streaks: dict[str, int] = {}
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            # deque(maxlen) mantém só a cauda sem materializar o CSV inteiro
            rows = deque(csv.DictReader(handle), maxlen=_TAIL_ROWS)
    except (OSError, csv.Error, UnicodeDecodeError):
        return {}
    for row in rows:
        if row.get("site") != site or row.get("route") != route:
            continue
        strategy = row.get("strategy") or ""
        if not strategy:
            continue
        if row.get("outcome") == "success":
            streaks[strategy] = 0
        else:
            streaks[strategy] = streaks.get(strategy, 0) + 1
    return streaks


def demote_failing_strategies(
    settings: Settings, site: str, route: str, order: list[str]
) -> list[str]:
    """Move para o FIM as estratégias com >= FAILURE_DEMOTE_STREAK falhas
    seguidas nesta rota, preservando a ordem relativa. Nunca remove."""
    streaks = failure_streaks(settings, site, route)
    healthy = [s for s in order if streaks.get(s, 0) < FAILURE_DEMOTE_STREAK]
    demoted = [s for s in order if streaks.get(s, 0) >= FAILURE_DEMOTE_STREAK]
    return healthy + demoted
