"""Unified route catalogue across Copa, LATAM and Skyscanner coverage."""

from __future__ import annotations

from ..models import Route
from . import copa, latam, skyscanner


class RouteCatalog:
    """Answers "how can I fly O→D and which carriers should we scrape?"."""

    @staticmethod
    def all_routes() -> list[Route]:
        return copa.all_routes() + latam.all_routes() + skyscanner.all_routes()

    @staticmethod
    def airline_routes_between(origin: str, destination: str) -> list[Route]:
        """Scrapable airline options (CM + LA) for the pair."""
        return copa.routes_between(origin, destination) + latam.routes_between(
            origin, destination
        )

    @staticmethod
    def candidates(origin: str, destination: str) -> list[Route]:
        """Every option for the pair: airline routes + metasearch catch-all."""
        return RouteCatalog.airline_routes_between(origin, destination) + (
            skyscanner.routes_between(origin, destination)
        )

    @staticmethod
    def coverage_summary() -> dict[str, int]:
        return {
            "copa": len(copa.all_routes()),
            "latam": len(latam.all_routes()),
            "skyscanner": len(skyscanner.all_routes()),
        }
