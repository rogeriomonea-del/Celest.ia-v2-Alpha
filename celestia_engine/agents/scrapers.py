"""Agentes de scraping por companhia (Copa e LATAM).

Cada agente sabe raspar UMA companhia. O orquestrador os instancia por
candidato aprovado no pré-filtro; internamente cada scrape roda como
subagente sob o semáforo global.
"""

from __future__ import annotations

from datetime import date

from ..models import Cabin, FlightOffer, Route
from ..providers.airline_scraper import scrape_airline
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
            result = await scrape_airline(
                self.ctx.settings, site=self.site, route=route, depart=depart, cabin=cabin
            )
            offers.extend(result)
        return offers


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
