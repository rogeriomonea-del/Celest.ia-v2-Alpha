"""Infraestrutura comum dos agentes: contexto compartilhado e eventos."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional

from celestia_travel.config import Settings
from celestia_travel.models import (
    DealEvaluation,
    FlightOffer,
    FlightQuery,
    MilesBalance,
    SearchTask,
)

LEVEL_INFO = "info"
LEVEL_OK = "ok"
LEVEL_WARN = "warn"
LEVEL_ERROR = "error"


@dataclass(frozen=True)
class AgentEvent:
    """Linha de log estruturada emitida por um agente."""

    agent: str
    level: str
    message: str
    timestamp: datetime


EventListener = Callable[[AgentEvent], None]


@dataclass
class AgentContext:
    """Estado compartilhado que flui pelo pipeline de agentes."""

    query: FlightQuery
    settings: Settings
    listener: Optional[EventListener] = None

    tasks: list[SearchTask] = field(default_factory=list)
    offers: list[FlightOffer] = field(default_factory=list)
    evaluations: list[DealEvaluation] = field(default_factory=list)
    balances: list[MilesBalance] = field(default_factory=list)
    providers_queried: list[str] = field(default_factory=list)
    providers_failed: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    offers_found: int = 0

    def emit(self, agent: str, level: str, message: str) -> None:
        event = AgentEvent(
            agent=agent,
            level=level,
            message=message,
            timestamp=datetime.now(),
        )
        if self.listener is not None:
            self.listener(event)

    def warn(self, agent: str, message: str) -> None:
        self.warnings.append(message)
        self.emit(agent, LEVEL_WARN, message)


class Agent(abc.ABC):
    """Um estágio do pipeline: lê e muta o :class:`AgentContext`."""

    name: str = "agent"

    @abc.abstractmethod
    async def run(self, ctx: AgentContext) -> None:
        ...
