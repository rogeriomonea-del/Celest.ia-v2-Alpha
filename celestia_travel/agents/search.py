"""Agente 2 — Buscador: executa as tarefas em paralelo nos provedores."""
from __future__ import annotations

import asyncio

from celestia_travel.agents.base import (
    LEVEL_INFO,
    LEVEL_OK,
    Agent,
    AgentContext,
)
from celestia_travel.models import FlightOffer, SearchTask
from celestia_travel.providers.base import (
    FlightProvider,
    ProviderError,
    ProviderNotConfigured,
)


class SearchAgent(Agent):
    name = "buscador"

    def __init__(self, providers: list[FlightProvider]) -> None:
        self._providers = {provider.name: provider for provider in providers}

    async def run(self, ctx: AgentContext) -> None:
        ctx.emit(
            self.name,
            LEVEL_INFO,
            f"Disparando {len(ctx.tasks)} buscas em paralelo...",
        )

        not_configured: set[str] = set()
        results = await asyncio.gather(
            *(self._run_task(ctx, task, not_configured) for task in ctx.tasks)
        )

        offers: list[FlightOffer] = []
        for result in results:
            offers.extend(result)

        queried = sorted(
            name for name in self._providers if name not in not_configured
        )
        ctx.providers_queried = queried
        ctx.providers_failed = sorted(not_configured)
        ctx.offers = offers
        ctx.offers_found = len(offers)

        ctx.emit(
            self.name,
            LEVEL_OK,
            f"{len(offers)} ofertas coletadas de {len(queried)} provedor(es).",
        )

    async def _run_task(
        self,
        ctx: AgentContext,
        task: SearchTask,
        not_configured: set[str],
    ) -> list[FlightOffer]:
        provider = self._providers.get(task.provider_name)
        if provider is None:
            ctx.warn(self.name, f"Provedor desconhecido na tarefa: {task.provider_name}")
            return []

        try:
            offers = await provider.search(task)
        except ProviderNotConfigured as error:
            if provider.name not in not_configured:
                not_configured.add(provider.name)
                ctx.warn(self.name, f"{provider.name} ignorado: {error}")
            return []
        except ProviderError as error:
            ctx.warn(
                self.name,
                f"{provider.name} falhou em {task.depart_date.isoformat()}: {error}",
            )
            return []

        ctx.emit(
            self.name,
            LEVEL_INFO,
            f"{provider.name} → {len(offers)} oferta(s) em {task.depart_date.strftime('%d/%m')}",
        )
        return offers
