"""RouteMeshAgent — mantém a malha de rotas viva com dados oficiais (Lyov/DECEA).

Busca os planos de voo RPL de TAM/GLO/AZU em paralelo (subagentes), converte
para rotas IATA e persiste em CSV (``MESH_CSV``, padrão data/routes_live.csv).
O orquestrador soma essas rotas às malhas curadas na hora de planejar
candidatos — a curadoria continua como base, o CSV vivo cobre o que mudou.
"""

from __future__ import annotations

import asyncio
import csv
import os
from datetime import date, datetime, timezone
from pathlib import Path

from ..config import Settings
from ..models import Route
from ..providers import lyov
from .base import Agent

MESH_FIELDS = ["carrier", "origin", "destination", "direct", "via", "updated_at"]
DEFAULT_COMPANIES = ("TAM", "GLO", "AZU")


class RouteMeshAgent(Agent):
    name = "route-mesh"

    async def refresh(
        self, companies: tuple[str, ...] = DEFAULT_COMPANIES, cycle: date | None = None
    ) -> list[Route]:
        cycle = cycle or date.today()
        plans: list[dict] = []
        if self.ctx.settings.mock_mode:
            for company in companies:
                plans.extend(lyov.mock_plans(company))
                self.log(f"mock: {company} carregada")
        else:
            # companhias em paralelo, sob o semáforo global de subagentes
            results = await asyncio.gather(
                *(
                    self.ctx.spawn(
                        self.name,
                        f"lyov {company} {cycle.isoformat()}",
                        lambda c=company: lyov.fetch_plans(
                            self.ctx.settings, company=c, cycle=cycle
                        ),
                    )
                    for company in companies
                )
            )
            for result in results:
                if isinstance(result, Exception):
                    continue
                plans.extend(result)
        routes = lyov.plans_to_routes(plans)
        self.log(f"{len(plans)} planos RPL → {len(routes)} rotas únicas")
        if routes:
            path = save_mesh_csv(routes, Path(self.ctx.settings.mesh_csv))
            self.log(f"malha viva gravada em {path}")
        return routes


def save_mesh_csv(routes: list[Route], path: Path) -> Path:
    """Atomic write: temp file + os.replace, so readers never see a half file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # tmp único por processo: duas escritas concorrentes não se atropelam
    tmp_path = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    with tmp_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MESH_FIELDS)
        writer.writeheader()
        for route in sorted(routes, key=lambda r: (r.carrier, r.origin, r.destination)):
            writer.writerow(
                {
                    "carrier": route.carrier,
                    "origin": route.origin,
                    "destination": route.destination,
                    "direct": "1" if route.direct else "0",
                    "via": route.via or "",
                    "updated_at": stamp,
                }
            )
    os.replace(tmp_path, path)
    return path


def load_live_routes(settings: Settings) -> list[Route]:
    """Routes from the live mesh CSV — best-effort like the history store.

    A corrupt/truncated file must never break a search: bad rows are skipped
    and any reader failure degrades to an empty list.
    """
    path = Path(settings.mesh_csv)
    if not path.is_file():
        return []
    routes: list[Route] = []
    try:
        # utf-8-sig: remove o BOM se alguém salvou o CSV pelo Excel
        with path.open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                origin = row.get("origin")
                destination = row.get("destination")
                carrier = row.get("carrier")
                if not origin or not destination or not carrier:
                    continue
                routes.append(
                    Route(
                        origin=origin.upper(),
                        destination=destination.upper(),
                        carrier=carrier.upper(),
                        direct=(row.get("direct") or "1") != "0",
                        via=row.get("via") or None,
                    )
                )
    except (OSError, csv.Error, UnicodeDecodeError):
        return []
    return routes


def live_routes_between(settings: Settings, origin: str, destination: str) -> list[Route]:
    origin, destination = origin.upper(), destination.upper()
    return [
        route
        for route in load_live_routes(settings)
        if route.origin == origin and route.destination == destination
    ]
