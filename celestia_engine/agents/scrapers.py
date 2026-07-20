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
from ..storage import (
    demote_failing_strategies,
    rank_strategies,
    record_attempt,
    record_route_outcome,
)
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
            # estratégia desligada por config não entra na disputa (para não
            # acumular "falhas" e afundar seu score de aprendizado)
            if name == "firecrawl_interact" and not settings.firecrawl_interact_enabled:
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
        # memória de falhas POR ROTA: estratégias que falharam seguidas nesta
        # rota vão para o fim da fila (não repete primeiro o que já falhou)
        demoted_order = demote_failing_strategies(
            self.ctx.settings, self.site, route.key(), order
        )
        if demoted_order != order:
            self.log(f"memória de falhas ({route.key()}): ordem ajustada")
        order = demoted_order
        self.log(f"ordem de estratégias ({self.site}): {', '.join(order)}")

        last_error: Exception | None = None
        for strategy in order:
            started = time.monotonic()
            try:
                offers = await STRATEGY_FUNCS[strategy](self, route, depart)
            except ProviderNotConfigured as error:
                # "não configurado/desligado" é skip, NÃO falha de desempenho —
                # não registra, para não poluir o ranking de aprendizado.
                self.log(f"{strategy} indisponível: {error}")
                continue
            except ProviderError as error:
                record_attempt(
                    self.ctx.settings, site=self.site, strategy=strategy,
                    success=False, offers_found=0, duration_s=time.monotonic() - started,
                )
                record_route_outcome(
                    self.ctx.settings, site=self.site, strategy=strategy,
                    route=route.key(), depart=depart.isoformat(),
                    success=False, error=str(error),
                )
                self.log(f"{strategy} falhou: {error}")
                last_error = error
                continue
            record_attempt(
                self.ctx.settings, site=self.site, strategy=strategy,
                success=True, offers_found=len(offers), duration_s=time.monotonic() - started,
            )
            record_route_outcome(
                self.ctx.settings, site=self.site, strategy=strategy,
                route=route.key(), depart=depart.isoformat(), success=True,
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
