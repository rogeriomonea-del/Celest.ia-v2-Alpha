"""Agente 5 — Relator: consolida o relatório final da missão."""
from __future__ import annotations

import asyncio
from datetime import datetime

from celestia_travel.agents.advisor import heuristic_narrative, llm_narrative
from celestia_travel.agents.base import LEVEL_INFO, LEVEL_OK, Agent, AgentContext
from celestia_travel.models import ResearchReport

TOP_N = 5


class ReportAgent(Agent):
    name = "relator"

    def __init__(self) -> None:
        self.report: ResearchReport | None = None

    async def run(self, ctx: AgentContext) -> None:
        top = ctx.evaluations[:TOP_N]
        ctx.emit(
            self.name,
            LEVEL_INFO,
            f"Consolidando relatório com top {len(top)} de {len(ctx.evaluations)} ofertas...",
        )

        narrative_source = "heuristica"
        narrative = None
        if ctx.settings.use_llm:
            ctx.emit(self.name, LEVEL_INFO, "Solicitando parecer analítico ao Claude...")
            narrative = await asyncio.to_thread(
                llm_narrative, ctx.query, top, ctx.settings
            )
            if narrative:
                narrative_source = f"claude ({ctx.settings.llm_model})"
            else:
                ctx.warn(
                    self.name,
                    "Narrativa via Claude indisponível — usando análise heurística.",
                )

        if not narrative:
            narrative = heuristic_narrative(
                ctx.query, top, ctx.settings.milheiro_reference
            )

        self.report = ResearchReport(
            query=ctx.query,
            generated_at=datetime.now(),
            providers_queried=ctx.providers_queried,
            providers_failed=ctx.providers_failed,
            offers_found=ctx.offers_found,
            offers_valid=len(ctx.offers),
            evaluations=top,
            narrative=narrative,
            narrative_source=narrative_source,
            warnings=list(ctx.warnings),
        )

        ctx.emit(
            self.name,
            LEVEL_OK,
            f"Relatório pronto (narrativa: {narrative_source}).",
        )
