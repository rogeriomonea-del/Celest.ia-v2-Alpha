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
from ..providers import google_flights, google_flights2, skyscanner
from ..providers.base import ProviderError
from ..providers.mock import mock_quote
from .base import Agent

Candidate = tuple[Route, date]


class PriceScoutAgent(Agent):
    name = "price-scout"

    async def prefilter(
        self, candidates: list[Candidate], cabin: Cabin
    ) -> dict[tuple[str, str], FareQuote]:
        """Cheapest indicative quote per (route-slug, date). Empty dict = no
        pre-filter source configured (orchestrator will scrape everything).

        As fontes de metasearch cotam por PAR (origem, destino, data) — não por
        companhia. Por isso as chamadas pagas são deduplicadas por par e o
        resultado é replicado para cada rota candidata daquele par.
        """
        sources = self._sources()
        if not sources:
            self.log("nenhuma fonte de pré-filtro configurada — sem shortlist")
            return {}
        self.log("fontes ativas: " + ", ".join(name for name, _ in sources))

        groups: dict[tuple[str, str, str], list[Candidate]] = {}
        for route, depart in candidates:
            key = (route.origin, route.destination, depart.isoformat())
            groups.setdefault(key, []).append((route, depart))

        async def fetch_group(
            key: tuple[str, str, str], route: Route, depart: date, source_name: str, fetch
        ):
            label = f"{source_name} {route.key()} {depart.isoformat()}"
            result = await self.ctx.spawn(
                self.name, label, lambda: fetch(route, depart, cabin)
            )
            return key, source_name, result

        results = await asyncio.gather(
            *(
                fetch_group(key, members[0][0], members[0][1], source_name, fetch)
                for key, members in groups.items()
                for source_name, fetch in sources
            )
        )

        cheapest: dict[tuple[str, str, str], FareQuote] = {}
        for key, source_name, result in results:
            if isinstance(result, ProviderNotConfigured):
                continue
            if isinstance(result, ProviderError):
                self.log(f"{source_name} indisponível para {key[0]}-{key[1]}: {result}")
                continue
            if isinstance(result, Exception):
                continue
            for quote in result:
                if key not in cheapest or quote.price_brl < cheapest[key].price_brl:
                    cheapest[key] = quote

        best: dict[tuple[str, str], FareQuote] = {}
        for key, members in groups.items():
            pair_quote = cheapest.get(key)
            if pair_quote is None:
                continue
            for route, depart in members:
                best[(route.slug(), depart.isoformat())] = FareQuote(
                    route=route,
                    depart=pair_quote.depart,
                    cabin=pair_quote.cabin,
                    price_brl=pair_quote.price_brl,
                    source=pair_quote.source,
                    fetched_at=pair_quote.fetched_at,
                )
        saved = sum(len(m) - 1 for m in groups.values()) * len(sources)
        self.log(
            f"{len(cheapest)} pares cotados → {len(best)} candidatos cobertos "
            f"({saved} chamadas deduplicadas)"
        )
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
        if settings.has_google_flights2():
            async def gf2_fetch(route: Route, depart: date, cabin: Cabin):
                return await google_flights2.quote(settings, route, depart, cabin)

            sources.append(("google_flights2", gf2_fetch))
        if settings.has_skyscanner():
            async def sky_fetch(route: Route, depart: date, cabin: Cabin):
                return await skyscanner.quote(settings, route, depart, cabin)

            sources.append(("skyscanner", sky_fetch))
        return sources
