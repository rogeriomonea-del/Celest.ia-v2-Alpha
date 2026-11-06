"""Aprendizado da malha de companhias (self-improvement).

A cada busca, companhias que aparecem nas ofertas/cotações e que ainda não
estão no registro curado (``celestia_engine/airlines.py``) nem no CSV são
gravadas em ``data/airlines_discovered.csv`` — a malha conhecida cresce
sozinha com o uso, sem editar código. Best-effort: I/O nunca quebra a busca.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from ..airlines import AIRLINE_REGISTRY
from ..config import Settings
from .csvio import READ_ERRORS, append_rows, read_rows

DISCOVERED_FIELDS = [
    "first_seen_utc",
    "code",
    "label",
    "sample_route",
    "source",
]


def _discovered_path(settings: Settings) -> Path:
    return Path(settings.strategy_csv).parent / "airlines_discovered.csv"


def load_discovered(settings: Settings) -> dict[str, dict]:
    """{code: row} das companhias já descobertas. Tolerante a CSV corrompido."""
    path = _discovered_path(settings)
    if not path.is_file():
        return {}
    out: dict[str, dict] = {}
    try:
        for row in read_rows(path):
            code = (row.get("code") or "").strip().upper()
            if len(code) == 2 and code not in out:
                out[code] = row
    except READ_ERRORS:
        return {}
    return out


def known_carrier_codes(settings: Settings) -> set[str]:
    """Curadas + descobertas — a malha total que o sistema conhece."""
    return set(AIRLINE_REGISTRY) | set(load_discovered(settings))


def record_carriers(settings: Settings, offers) -> list[str]:
    """Registra companhias inéditas vistas nesta busca. Retorna os códigos novos."""
    try:
        known = known_carrier_codes(settings)
        new_rows: list[dict] = []
        for offer in offers:
            code = (offer.carrier or "").strip().upper()
            if len(code) != 2 or not code.isalnum() or code in known:
                continue
            known.add(code)
            new_rows.append(
                {
                    "first_seen_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "code": code,
                    "label": str((offer.raw or {}).get("airline_label") or ""),
                    "sample_route": f"{offer.origin}-{offer.destination}",
                    "source": offer.source.value,
                }
            )
        if not new_rows:
            return []
        append_rows(_discovered_path(settings), DISCOVERED_FIELDS, new_rows)
        return [row["code"] for row in new_rows]
    except Exception:  # noqa: BLE001 - aprendizado nunca derruba a busca
        return []
