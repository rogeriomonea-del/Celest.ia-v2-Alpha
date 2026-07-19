"""RouteMeshAgent — mantém a malha de rotas viva com dados oficiais (Lyov/DECEA).

Busca os planos de voo RPL de TAM/GLO/AZU em paralelo (subagentes), converte
para rotas IATA e persiste em CSV (``MESH_CSV``, padrão data/routes_live.csv).
O orquestrador soma essas rotas às malhas curadas na hora de planejar
candidatos — a curadoria continua como base, o CSV vivo cobre o que mudou.
"""

from __future__ import annotations

import csv
from datetime import date, datetime
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
        for company in companies:
            if self.ctx.settings.mock_mode:
                plans.extend(lyov.mock_plans(company))
                self.log(f"mock: {company} carregada")
                continue
            result = await self.ctx.spawn(
                self.name,
                f"lyov {company} {cycle.isoformat()}",
                lambda c=company: lyov.fetch_plans(
                    self.ctx.settings, company=c, cycle=cycle
                ),
            )
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
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().isoformat(timespec="seconds")
    with path.open("w", newline="", encoding="utf-8") as handle:
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
    return path


def load_live_routes(settings: Settings) -> list[Route]:
    """Routes from the live mesh CSV; empty list when the file doesn't exist."""
    path = Path(settings.mesh_csv)
    if not path.is_file():
        return []
    routes: list[Route] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            try:
                routes.append(
                    Route(
                        origin=row["origin"].upper(),
                        destination=row["destination"].upper(),
                        carrier=row["carrier"].upper(),
                        direct=row.get("direct", "1") != "0",
                        via=row.get("via") or None,
                    )
                )
            except KeyError:
                continue
    return routes


def live_routes_between(settings: Settings, origin: str, destination: str) -> list[Route]:
    origin, destination = origin.upper(), destination.upper()
    return [
        route
        for route in load_live_routes(settings)
        if route.origin == origin and route.destination == destination
    ]
