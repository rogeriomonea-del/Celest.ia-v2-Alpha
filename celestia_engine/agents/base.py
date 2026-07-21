"""Infra comum dos agentes: contexto compartilhado, log e spawning."""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable

from ..config import Settings


@dataclass
class AgentContext:
    """Shared state handed to every agent by the orchestrator."""

    settings: Settings
    log_lines: list[str] = field(default_factory=list)
    subagents_spawned: int = 0
    _semaphore: asyncio.Semaphore | None = None

    def semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self.settings.max_subagents)
        return self._semaphore

    def log(self, agent: str, message: str) -> None:
        stamp = datetime.utcnow().strftime("%H:%M:%S")
        line = f"[{stamp}] {agent}: {message}"
        self.log_lines.append(line)
        if self.settings.verbose:
            # tempo real no stderr — o usuário vê o progresso da busca ao vivo
            print(f"  {line}", file=sys.stderr, flush=True)

    async def spawn(
        self, agent: str, label: str, coro_fn: Callable[[], Awaitable[Any]]
    ) -> Any:
        """Run a subagent task under the global concurrency semaphore.

        Every spawn is logged and counted; failures are captured and returned
        as the exception instance so the caller can degrade gracefully.
        Cada subagente tem um teto próprio (SUBAGENT_TIMEOUT_S): um scraper
        pendurado não pode consumir o timeout da busca inteira e transformar
        resultados parciais num 504 sem nada.
        """
        self.subagents_spawned += 1
        self.log(agent, f"subagente iniciado → {label}")
        timeout = self.settings.subagent_timeout_s or None
        try:
            async with self.semaphore():
                result = await asyncio.wait_for(coro_fn(), timeout=timeout)
            self.log(agent, f"subagente concluído ← {label}")
            return result
        except Exception as error:  # noqa: BLE001 - propagate as value
            detail = str(error) or type(error).__name__
            self.log(agent, f"subagente falhou ← {label}: {detail}")
            return error


class Agent:
    name = "agent"

    def __init__(self, ctx: AgentContext):
        self.ctx = ctx

    def log(self, message: str) -> None:
        self.ctx.log(self.name, message)
