"""Agentes de scraping por companhia (Copa e LATAM) com estratégias aprendidas.

Cada companhia pode ser raspada por 3 estratégias, da mais promissora à mais
robusta:

1. **firecrawl_interact** — sessão de browser viva (Firecrawl v2): preenche o
   formulário e extrai tarifas de várias companhias de uma vez. Mais rápido e
   econômico; é o fluxo preferido quando funciona.
2. **firecrawl_scrape** — Firecrawl estático (/v1/scrape) sobre o deep-link.
3. **playwright_local** — Chromium local interceptando o JSON de preços.

A ORDEM em que são tentadas não é fixa: `StrategySelector` a reordena a cada
busca com base no desempenho real gravado em ``data/strategy_performance.csv``
(self-improvement). Toda tentativa — sucesso ou falha — é registrada, então o
sistema aprende qual fluxo vale mais a pena para cada site.
"""

from __future__ import annotations

import time
from datetime import date

from ..models import Cabin, FlightOffer, Route
from ..providers import firecrawl, firecrawl_interact
from ..providers.airline_scraper import scrape_airline
from ..providers.base import ProviderError, ProviderNotConfigured
from ..providers.mock import mock_offers
from ..storage import rank_strategies, record_attempt
from .base import Agent


async def _strategy_firecrawl_interact(agent, route, depart):
    return await firecrawl_interact.scrape_flights(
        agent.ctx.settings, site=agent.site, route=route, depart=depart
    )


async def _strategy_firecrawl_scrape(agent, route, depart):
    offers: list[FlightOffer] = []
    for cabin in (Cabin.ECONOMY, Cabin.BUSINESS):
        offers.extend(
            await firecrawl.scrape(
                agent.ctx.settings, site=agent.site, route=route, depart=depart, cabin=cabin
            )
        )
    return offers


async def _strategy_playwright_local(agent, route, depart):
    offers: list[FlightOffer] = []
    for cabin in (Cabin.ECONOMY, Cabin.BUSINESS):
        offers.extend(
            await scrape_airline(
                agent.ctx.settings, site=agent.site, route=route, depart=depart, cabin=cabin
            )
        )
    return offers


STRATEGY_FUNCS = {
    "firecrawl_interact": _strategy_firecrawl_interact,
    "firecrawl_scrape": _strategy_firecrawl_scrape,
    "playwright_local": _strategy_playwright_local,
}


class AirlineScraperAgent(Agent):
    site: str = ""
    carrier: str = ""
    program: str = ""

    def _available_strategies(self) -> list[str]:
        settings = self.ctx.settings
        wanted = [s.strip() for s in settings.scrape_strategies.split(",") if s.strip()]
        available = []
        for name in wanted:
            if name not in STRATEGY_FUNCS:
                continue
            if name.startswith("firecrawl") and not settings.has_firecrawl():
                continue
            available.append(name)
        return available

    async def fetch_offers(self, route: Route, depart: date) -> list[FlightOffer]:
        if self.ctx.settings.mock_mode:
            return mock_offers(self.carrier, self.program, route, depart)

        strategies = self._available_strategies()
        if not strategies:
            raise ProviderError("nenhuma estratégia de scraping disponível")
        order = rank_strategies(self.ctx.settings, self.site, strategies)
        self.log(f"ordem de estratégias ({self.site}): {', '.join(order)}")

        last_error: Exception | None = None
        for strategy in order:
            started = time.monotonic()
            try:
                offers = await STRATEGY_FUNCS[strategy](self, route, depart)
            except ProviderNotConfigured as error:
                record_attempt(
                    self.ctx.settings, site=self.site, strategy=strategy,
                    success=False, offers_found=0, duration_s=time.monotonic() - started,
                )
                self.log(f"{strategy} indisponível: {error}")
                continue
            except ProviderError as error:
                record_attempt(
                    self.ctx.settings, site=self.site, strategy=strategy,
                    success=False, offers_found=0, duration_s=time.monotonic() - started,
                )
                self.log(f"{strategy} falhou: {error}")
                last_error = error
                continue
            record_attempt(
                self.ctx.settings, site=self.site, strategy=strategy,
                success=True, offers_found=len(offers), duration_s=time.monotonic() - started,
            )
            for offer in offers:
                offer.raw.setdefault("strategy", strategy)
            self.log(f"{strategy} ✓ — {len(offers)} ofertas em {time.monotonic()-started:.1f}s")
            return offers

        raise last_error or ProviderError(
            f"todas as estratégias falharam para {self.site} {route.key()}"
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
