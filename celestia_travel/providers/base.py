"""Contrato comum dos provedores de busca."""
from __future__ import annotations

import abc

from celestia_travel.models import FlightOffer, SearchTask


class ProviderError(RuntimeError):
    """Falha de comunicação ou de parsing em um provedor."""


class ProviderNotConfigured(ProviderError):
    """O provedor existe mas não tem credenciais/endpoint configurados."""


class FlightProvider(abc.ABC):
    """Interface assíncrona de um provedor de ofertas de voo."""

    name: str = "provider"

    @abc.abstractmethod
    async def search(self, task: SearchTask) -> list[FlightOffer]:
        """Executa uma tarefa de busca e retorna ofertas normalizadas.

        Deve levantar :class:`ProviderNotConfigured` quando faltarem
        credenciais e :class:`ProviderError` para falhas de rede/parsing —
        nunca retornar dados inventados silenciosamente.
        """
