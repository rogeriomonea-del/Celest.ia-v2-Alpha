"""Orquestrador state-driven do pipeline de agentes.

Fluxo: planejador → buscador (fan-out paralelo interno) → auditor →
avaliador → relator. Cada agente lê e muta o :class:`AgentContext`; eventos
de log fluem para o listener registrado (ex.: o terminal da CLI).
"""
from __future__ import annotations

import asyncio
from typing import Optional, Sequence

from celestia_travel.agents.auditor import AuditorAgent
from celestia_travel.agents.base import (
    LEVEL_ERROR,
    LEVEL_OK,
    AgentContext,
    EventListener,
)
from celestia_travel.agents.planner import PlannerAgent
from celestia_travel.agents.reporter import ReportAgent
from celestia_travel.agents.search import SearchAgent
from celestia_travel.agents.valuation import MilesValuationAgent
from celestia_travel.config import Settings
from celestia_travel.models import FlightQuery, MilesBalance, ResearchReport
from celestia_travel.providers.base import FlightProvider


class Orchestrator:
    name = "orquestrador"

    def __init__(
        self,
        providers: Sequence[FlightProvider],
        settings: Optional[Settings] = None,
        listener: Optional[EventListener] = None,
    ) -> None:
        if not providers:
            raise ValueError("Ao menos um provedor é necessário.")
        self._providers = list(providers)
        self._settings = settings or Settings()
        self._listener = listener

    async def run(
        self,
        query: FlightQuery,
        balances: Optional[Sequence[MilesBalance]] = None,
    ) -> ResearchReport:
        ctx = AgentContext(
            query=query,
            settings=self._settings,
            listener=self._listener,
        )
        ctx.balances = list(balances or [])

        planner = PlannerAgent([provider.name for provider in self._providers])
        searcher = SearchAgent(self._providers)
        auditor = AuditorAgent()
        reporter = ReportAgent()

        await planner.run(ctx)
        await searcher.run(ctx)
        await auditor.run(ctx)
        valuator = MilesValuationAgent(auditor.flagged)
        await valuator.run(ctx)
        await reporter.run(ctx)

        if reporter.report is None:  # pragma: no cover - proteção defensiva
            ctx.emit(self.name, LEVEL_ERROR, "Relator não produziu relatório.")
            raise RuntimeError("Pipeline terminou sem relatório.")

        ctx.emit(self.name, LEVEL_OK, "Missão concluída.")
        return reporter.report

    def run_sync(
        self,
        query: FlightQuery,
        balances: Optional[Sequence[MilesBalance]] = None,
    ) -> ResearchReport:
        return asyncio.run(self.run(query, balances))
