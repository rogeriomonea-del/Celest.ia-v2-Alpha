"""Agente 1 — Planejador: decompõe a missão em tarefas de busca."""
from __future__ import annotations

from datetime import timedelta

from celestia_travel.agents.base import LEVEL_INFO, LEVEL_OK, Agent, AgentContext
from celestia_travel.models import SearchTask

_WEEKDAY_NAMES = [
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
]


class PlannerAgent(Agent):
    name = "planejador"

    def __init__(self, provider_names: list[str]) -> None:
        self._provider_names = provider_names

    async def run(self, ctx: AgentContext) -> None:
        query = ctx.query
        ctx.emit(
            self.name,
            LEVEL_INFO,
            f"Missão: {query.route} em {query.depart_date.isoformat()} "
            f"(±{query.flex_days}d, {query.cabin.value}, {query.passengers} pax)",
        )

        dates = sorted(
            {
                query.depart_date + timedelta(days=offset)
                for offset in range(-query.flex_days, query.flex_days + 1)
            }
        )

        cheap_days = [d for d in dates if d.weekday() in (1, 2)]
        if cheap_days and query.flex_days > 0:
            ctx.emit(
                self.name,
                LEVEL_INFO,
                "Janela inclui "
                + ", ".join(
                    f"{d.strftime('%d/%m')} ({_WEEKDAY_NAMES[d.weekday()]})"
                    for d in cheap_days
                )
                + " — dias historicamente mais baratos.",
            )

        ctx.tasks = [
            SearchTask(
                provider_name=provider,
                origin=query.origin,
                destination=query.destination,
                depart_date=depart_date,
                cabin=query.cabin,
                passengers=query.passengers,
            )
            for provider in self._provider_names
            for depart_date in dates
        ]

        ctx.emit(
            self.name,
            LEVEL_OK,
            f"Plano montado: {len(dates)} data(s) × {len(self._provider_names)} "
            f"provedor(es) = {len(ctx.tasks)} tarefas de busca.",
        )
