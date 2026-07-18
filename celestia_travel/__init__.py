"""celest.ia Travel — pesquisa multi-agente de passagens aéreas e milhas.

Pacote com arquitetura real de agentes:

- ``PlannerAgent`` decompõe a missão em tarefas de busca (datas flexíveis);
- ``SearchAgent`` executa as tarefas em paralelo contra os provedores;
- ``AuditorAgent`` deduplica, valida e sinaliza ofertas suspeitas;
- ``MilesValuationAgent`` compara dinheiro vs. milhas (valor do milheiro);
- ``ReportAgent`` consolida o relatório final, com narrativa opcional
  gerada pela API da Anthropic (fallback heurístico sem chave).
"""

from celestia_travel.models import (
    CabinClass,
    DealEvaluation,
    FlightOffer,
    FlightQuery,
    MilesBalance,
    ResearchReport,
    SearchTask,
)
from celestia_travel.orchestrator import Orchestrator

__version__ = "2.0.0"

__all__ = [
    "CabinClass",
    "DealEvaluation",
    "FlightOffer",
    "FlightQuery",
    "MilesBalance",
    "Orchestrator",
    "ResearchReport",
    "SearchTask",
    "__version__",
]
