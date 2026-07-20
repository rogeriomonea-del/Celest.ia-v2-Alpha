"""Orchestrator — o agente que comanda os demais.

Pipeline de uma busca:

1. **Planejamento** — expande o pedido em candidatos (rota × data), incluindo
   flexibilidade de datas e conexões via hub (Copa via PTY, LATAM via GRU/SCL).
2. **Pré-filtro** — PriceScoutAgent cota tudo no Google Flights/Skyscanner
   (baratos) e o orquestrador mantém só os ``prefilter_top_k`` mais baratos:
   é isso que derruba o custo por pesquisa.
3. **Scraping** — gera subagentes CopaScraper/LatamScraper em paralelo
   (limitados por ``max_subagents``) só para os candidatos aprovados.
4. **Cálculo** — MilesMathAgent compara as 4 estratégias e o milheiro.
5. **Auditoria** — dedup, sanidade e ranking final.
"""

from __future__ import annotations

import time
from datetime import timedelta

from ..config import Settings, load_settings
from ..models import (
    FareQuote,
    FlightOffer,
    Route,
    SearchReport,
    SearchRequest,
    SearchStats,
)
from ..routes import RouteCatalog
from ..storage import record_report
from .base import Agent, AgentContext
from .flex_scout import FlexDateScoutAgent
from .mesh import live_routes_between
from .miles import MilesMathAgent
from .prefilter import Candidate, PriceScoutAgent
from .scrapers import SCRAPERS_BY_CARRIER


class Orchestrator(Agent):
    name = "orchestrator"

    def __init__(self, settings: Settings):
        super().__init__(AgentContext(settings=settings))
        self.scout = PriceScoutAgent(self.ctx)
        self.miles_math = MilesMathAgent(self.ctx)
        self.flex_scout = FlexDateScoutAgent(self.ctx)

    @classmethod
    def from_env(cls) -> "Orchestrator":
        return cls(load_settings())

    # ------------------------------------------------------------------ plan
    def _routes_for(self, request: SearchRequest) -> list:
        routes = RouteCatalog.airline_routes_between(request.origin, request.destination)
        # malha viva (RPL/DECEA via RouteMeshAgent) complementa a curadoria;
        # qualquer problema no CSV degrada silenciosamente para a curadoria
        curated = {route.slug() for route in routes}
        try:
            live = live_routes_between(
                self.ctx.settings, request.origin, request.destination
            )
        except Exception as error:  # noqa: BLE001 - mesh nunca derruba a busca
            self.log(f"malha viva ignorada ({error})")
            live = []
        for route in live:
            if route.slug() not in curated:
                routes.append(route)
        if not routes:
            # fora das malhas CM/LA: ainda dá para cotar via metasearch
            routes = RouteCatalog.candidates(request.origin, request.destination)
        return routes

    async def _resolve_dates(self, request: SearchRequest) -> list:
        """Datas a considerar. Com flexibilidade, o flex-scout lê o calendário
        de preços e devolve só as mais baratas; senão, ±flex_days."""
        if request.flexibility and request.flexibility.enabled:
            return await self.flex_scout.cheapest_dates(request)
        return [
            request.depart + timedelta(days=offset)
            for offset in range(-request.flex_days, request.flex_days + 1)
        ]

    async def plan_candidates(self, request: SearchRequest) -> list[Candidate]:
        routes = self._routes_for(request)
        dates = await self._resolve_dates(request)
        candidates = [(route, depart) for route in routes for depart in dates]
        self.log(
            f"plano: {len(routes)} rota(s) × {len(dates)} data(s) = {len(candidates)} candidatos"
        )
        return candidates

    # ---------------------------------------------------------------- search
    async def search(self, request: SearchRequest) -> SearchReport:
        started = time.monotonic()
        stats = SearchStats()
        self.log(
            f"busca {request.origin}→{request.destination} {request.depart} "
            f"cabine-alvo={request.cabin_target.value} programa={request.program}"
        )

        candidates = await self.plan_candidates(request)
        stats.candidates_total = len(candidates)

        # 2. pré-filtro barato
        best_quotes = await self.scout.prefilter(candidates, request.cabin_target)
        shortlist = self._shortlist(candidates, best_quotes, stats)

        # 3. scraping caro só na shortlist, em subagentes paralelos
        offers = await self._scrape_shortlist(shortlist, stats)

        # 4. matemática de milhas/estratégias
        options = self.miles_math.evaluate_offers(offers, request)

        # 5. auditoria final
        offers = self._audit(offers)

        stats.subagents_spawned = self.ctx.subagents_spawned
        stats.duration_seconds = round(time.monotonic() - started, 2)
        self.log(
            f"concluído em {stats.duration_seconds}s — {len(offers)} ofertas, "
            f"{len(options)} opções de compra"
        )
        report = SearchReport(
            request=request,
            quotes=sorted(best_quotes.values(), key=lambda q: q.price_brl),
            offers=offers,
            options=options,
            stats=stats,
            agent_log=list(self.ctx.log_lines),
        )
        history_path = record_report(self.ctx.settings, report)
        if history_path:
            self.log(f"histórico gravado em {history_path}")
            report.agent_log = list(self.ctx.log_lines)
        return report

    # ------------------------------------------------------------- internals
    def _shortlist(
        self,
        candidates: list[Candidate],
        best_quotes: dict[tuple[str, str], FareQuote],
        stats: SearchStats,
    ) -> list[Candidate]:
        scrapable = [c for c in candidates if c[0].carrier in SCRAPERS_BY_CARRIER]
        if not best_quotes:
            stats.candidates_scraped = len(scrapable)
            self.log("sem pré-filtro: todos os candidatos serão raspados")
            return scrapable

        def price_of(candidate: Candidate) -> float:
            route, depart = candidate
            quote = best_quotes.get((route.slug(), depart.isoformat()))
            return quote.price_brl if quote else float("inf")

        ranked = sorted(scrapable, key=price_of)
        top_k = self.ctx.settings.prefilter_top_k
        shortlist = ranked[:top_k]
        stats.candidates_scraped = len(shortlist)
        stats.scrapes_saved_by_prefilter = max(0, len(scrapable) - len(shortlist))
        self.log(
            f"pré-filtro: {len(shortlist)} candidatos seguem para scraping "
            f"({stats.scrapes_saved_by_prefilter} scrapes economizados)"
        )
        return shortlist

    async def _scrape_shortlist(
        self, shortlist: list[Candidate], stats: SearchStats
    ) -> list[FlightOffer]:
        import asyncio

        async def scrape_one(route: Route, depart) -> list[FlightOffer] | Exception:
            agent_cls = SCRAPERS_BY_CARRIER[route.carrier]
            agent = agent_cls(self.ctx)
            label = f"{agent.name} {route.key()} {depart.isoformat()}"
            return await self.ctx.spawn(
                self.name, label, lambda: agent.fetch_offers(route, depart)
            )

        results = await asyncio.gather(
            *(scrape_one(route, depart) for route, depart in shortlist)
        )
        offers: list[FlightOffer] = []
        failures = 0
        for result in results:
            if isinstance(result, Exception):
                failures += 1
                continue
            offers.extend(result)
        if failures:
            self.log(f"{failures} scrape(s) falharam — degradando para o pré-filtro")
        return offers

    def _audit(self, offers: list[FlightOffer]) -> list[FlightOffer]:
        seen: set[str] = set()
        clean: list[FlightOffer] = []
        for offer in offers:
            key = f"{offer.itinerary_key()}:{offer.cabin.value}"
            if key in seen:
                continue
            cash_ok = offer.price_cash_brl is None or offer.price_cash_brl > 0
            miles_ok = offer.price_miles is None or offer.price_miles > 0
            if not (cash_ok and miles_ok):
                continue
            seen.add(key)
            clean.append(offer)
        clean.sort(key=lambda o: (o.price_cash_brl if o.price_cash_brl is not None else 9e12))
        if len(clean) != len(offers):
            self.log(f"auditoria: {len(offers) - len(clean)} oferta(s) removida(s)")
        return clean
