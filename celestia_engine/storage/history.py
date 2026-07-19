"""Histórico de pesquisas em CSV — o dataset que alimenta o ML do celest.ia.

Cada busca gera linhas com esquema FIXO e plano (uma linha por cotação de
pré-filtro, por oferta raspada e por estratégia calculada), sempre no mesmo
arquivo append-only ``<HISTORY_DIR>/searches.csv``. Consistência do esquema
> conveniência: colunas nunca mudam de ordem, valores ausentes ficam vazios,
datas em ISO-8601 UTC, preços com ponto decimal.

Uso downstream típico:
    import pandas as pd
    df = pd.read_csv("data/searches.csv", parse_dates=["timestamp_utc"])
"""

from __future__ import annotations

import csv
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ..config import Settings
from ..models import SearchReport

#: Esquema fixo do dataset. NÃO reordene: acrescente colunas só no final.
HISTORY_FIELDS = [
    "timestamp_utc",
    "search_id",
    "record_type",       # quote | offer | option
    "origin",
    "destination",
    "depart_date",
    "return_date",
    "cabin",
    "trip_flex_days",
    "program",
    "carrier",
    "flight_numbers",
    "route_via",
    "source",
    "strategy",
    "cabin_final",
    "price_cash_brl",
    "taxes_brl",
    "price_miles",
    "miles_program",
    "milheiro_brl",
    "effective_total_brl",
    "breakeven_milheiro_brl",
    "seats_left",
    "candidates_total",
    "candidates_scraped",
    "scrapes_saved",
    "subagents_spawned",
    "duration_seconds",
]


class SearchHistoryStore:
    def __init__(self, directory: Path | str):
        self.path = Path(directory) / "searches.csv"

    def record(self, report: SearchReport) -> Path:
        """Append every quote/offer/option of the report as flat rows."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        is_new = not self.path.exists()
        search_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        request = report.request
        stats = report.stats

        base = {
            "timestamp_utc": now,
            "search_id": search_id,
            "origin": request.origin,
            "destination": request.destination,
            "depart_date": request.depart.isoformat(),
            "return_date": request.return_date.isoformat() if request.return_date else "",
            "cabin": request.cabin_target.value,
            "trip_flex_days": request.flex_days,
            "program": request.program,
            "candidates_total": stats.candidates_total,
            "candidates_scraped": stats.candidates_scraped,
            "scrapes_saved": stats.scrapes_saved_by_prefilter,
            "subagents_spawned": stats.subagents_spawned,
            "duration_seconds": stats.duration_seconds,
        }

        rows: list[dict] = []
        for quote in report.quotes:
            rows.append(
                {
                    **base,
                    "record_type": "quote",
                    "carrier": quote.route.carrier,
                    "route_via": quote.route.via or "",
                    "source": quote.source.value,
                    "price_cash_brl": f"{quote.price_brl:.2f}",
                }
            )
        for offer in report.offers:
            rows.append(
                {
                    **base,
                    "record_type": "offer",
                    "carrier": offer.carrier,
                    "flight_numbers": "/".join(offer.flight_numbers),
                    "source": offer.source.value,
                    "cabin_final": offer.cabin.value,
                    "price_cash_brl": (
                        f"{offer.price_cash_brl:.2f}" if offer.price_cash_brl is not None else ""
                    ),
                    "taxes_brl": f"{offer.taxes_brl:.2f}",
                    "price_miles": offer.price_miles or "",
                    "miles_program": offer.miles_program or "",
                    "seats_left": offer.seats_left if offer.seats_left is not None else "",
                }
            )
        for option in report.options:
            rows.append(
                {
                    **base,
                    "record_type": "option",
                    "strategy": option.strategy.value,
                    "cabin_final": option.cabin_final.value,
                    "price_cash_brl": f"{option.cash_brl:.2f}",
                    "price_miles": option.miles or "",
                    "milheiro_brl": (
                        f"{option.milheiro_brl:.2f}" if option.milheiro_brl is not None else ""
                    ),
                    "effective_total_brl": f"{option.effective_total_brl:.2f}",
                    "breakeven_milheiro_brl": (
                        f"{option.breakeven_milheiro_brl:.2f}"
                        if option.breakeven_milheiro_brl is not None
                        else ""
                    ),
                }
            )

        with self.path.open("a", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=HISTORY_FIELDS, restval="")
            if is_new:
                writer.writeheader()
            writer.writerows(rows)
        return self.path


def record_report(settings: Settings, report: SearchReport) -> Path | None:
    """Best-effort persistence — a broken disk must never break a search."""
    if not settings.history_enabled:
        return None
    try:
        return SearchHistoryStore(settings.history_dir).record(report)
    except OSError:
        return None
