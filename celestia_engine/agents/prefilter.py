"""PriceScoutAgent — pré-filtro de preços via Google Flights e Skyscanner.

Consulta fontes de metasearch baratas ANTES do scraping caro nas companhias.
O orquestrador só escala scrapers para os melhores candidatos, reduzindo o
custo por pesquisa (menos sessões de navegador, menos chamadas caras).
Todas as cotações rodam em paralelo como subagentes sob o semáforo global.
"""

from __future__ import annotations

import asyncio
from datetime import date

from ..models import Cabin, FareQuote, Route
from ..providers import ProviderNotConfigured
from ..providers import google_flights, skyscanner
from ..providers.base import ProviderError
from ..providers.mock import mock_quote
from .base import Agent

Candidate = tuple[Route, date]


class PriceScoutAgent(Agent):
    name = "price-scout"

    async def prefilter(
        self, candidates: list[Candidate], cabin: Cabin
    ) -> dict[tuple[str, str], FareQuote]:
        """Cheapest indicative quote per (route-key, date). Empty dict = no
        pre-filter source configured (orchestrator will scrape everything)."""
        sources = self._sources()
        if not sources:
            self.log("nenhuma fonte de pré-filtro configurada — sem shortlist")
            return {}

        async def fetch_one(route: Route, depart: date, source_name: str, fetch):
            label = f"{source_name} {route.key()} {depart.isoformat()}"
            result = await self.ctx.spawn(
                self.name, label, lambda: fetch(route, depart, cabin)
            )
            return route, depart, source_name, result

        results = await asyncio.gather(
            *(
                fetch_one(route, depart, source_name, fetch)
                for route, depart in candidates
                for source_name, fetch in sources
            )
        )

        best: dict[tuple[str, str], FareQuote] = {}
        for route, depart, source_name, result in results:
            if isinstance(result, ProviderNotConfigured):
                continue
            if isinstance(result, ProviderError):
                self.log(f"{source_name} indisponível para {route.key()}: {result}")
                continue
            if isinstance(result, Exception):
                continue
            for quote in result:
                key = (route.slug(), depart.isoformat())
                if key not in best or quote.price_brl < best[key].price_brl:
                    best[key] = quote
        self.log(f"{len(best)} candidatos cotados no pré-filtro")
        return best

    def _sources(self):
        settings = self.ctx.settings
        sources = []
        if settings.mock_mode:
            async def mock_fetch(route: Route, depart: date, cabin: Cabin):
                return mock_quote(route, depart, cabin)

            return [("mock", mock_fetch)]
        if settings.has_google_flights():
            async def google_fetch(route: Route, depart: date, cabin: Cabin):
                return await google_flights.quote(settings, route, depart, cabin)

            sources.append(("google_flights", google_fetch))
        if settings.has_skyscanner():
            async def sky_fetch(route: Route, depart: date, cabin: Cabin):
                return await skyscanner.quote(settings, route, depart, cabin)

            sources.append(("skyscanner", sky_fetch))
        return sources
