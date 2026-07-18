"""Agentes de scraping por companhia (Copa e LATAM).

Cada agente sabe raspar UMA companhia. O orquestrador os instancia por
candidato aprovado no pré-filtro; internamente cada scrape roda como
subagente sob o semáforo global.

Cadeia de execução por cabine:
1. **Firecrawl** (se FIRECRAWL_API_KEY configurada) — scraping gerenciado
   com anti-bot e extração estruturada;
2. **Playwright local** — fallback automático quando o Firecrawl falha ou
   não está configurado.
"""

from __future__ import annotations

from datetime import date

from ..models import Cabin, FlightOffer, Route
from ..providers import firecrawl
from ..providers.airline_scraper import scrape_airline
from ..providers.base import ProviderError
from ..providers.mock import mock_offers
from .base import Agent


class AirlineScraperAgent(Agent):
    site: str = ""
    carrier: str = ""
    program: str = ""

    async def fetch_offers(self, route: Route, depart: date) -> list[FlightOffer]:
        if self.ctx.settings.mock_mode:
            return mock_offers(self.carrier, self.program, route, depart)
        offers: list[FlightOffer] = []
        # scrape economy and business shelves — miles/upgrade data rides along.
        for cabin in (Cabin.ECONOMY, Cabin.BUSINESS):
            offers.extend(await self._fetch_cabin(route, depart, cabin))
        return offers

    async def _fetch_cabin(
        self, route: Route, depart: date, cabin: Cabin
    ) -> list[FlightOffer]:
        settings = self.ctx.settings
        if settings.has_firecrawl():
            try:
                return await firecrawl.scrape(
                    settings, site=self.site, route=route, depart=depart, cabin=cabin
                )
            except ProviderError as error:
                self.log(
                    f"firecrawl falhou para {route.key()} {cabin.value} "
                    f"({error}) — fallback para Playwright local"
                )
        return await scrape_airline(
            settings, site=self.site, route=route, depart=depart, cabin=cabin
        )


class CopaScraperAgent(AirlineScraperAgent):
    name = "scraper-copa"
    site = "copa"
    carrier = "CM"
    program = "connectmiles"


class LatamScraperAgent(AirlineScraperAgent):
    name = "scraper-latam"
    site = "latam"
    carrier = "LA"
    program = "latampass"


SCRAPERS_BY_CARRIER = {"CM": CopaScraperAgent, "LA": LatamScraperAgent}
