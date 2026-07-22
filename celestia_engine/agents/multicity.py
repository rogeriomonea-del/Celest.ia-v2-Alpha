"""MultiCityOrchestrator — jornadas de 2..N trechos independentes.

Cada trecho roda num ``Orchestrator`` PRÓPRIO (nenhum estado vaza entre
trechos), mas todos compartilham UM ``asyncio.Semaphore`` de subagentes:
``max_subagents`` continua sendo um limite global da jornada, não por trecho.
O orçamento de scraping (``MULTICITY_MAX_SCRAPES``) é distribuído entre os
trechos via ``scrape_hard_cap`` — inclusive no caminho sem pré-filtro.

Semântica de preços: os providers pesquisam trechos independentes, então as
combinações usam ``pricingScope="independentLegs"`` — valores por passageiro,
sem promessa de PNR único, conexão protegida ou bagagem despachada de ponta a
ponta. Cada trecho mantém seu próprio link de reserva.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass, field, replace

from ..config import Settings
from ..models import FlightOffer, SearchReport, SearchRequest
from ..providers.base import _redact
from .orchestrator import Orchestrator

#: códigos estáveis de erro por trecho / jornada
LEG_TIMEOUT = "LEG_TIMEOUT"
LEG_SEARCH_FAILED = "LEG_SEARCH_FAILED"
MULTICITY_TIMEOUT = "MULTICITY_TIMEOUT"

#: estratégia sintética para tarifas indicativas sem opção de compra calculada
INDICATIVE_CASH = "indicative_cash"


@dataclass
class LegOutcome:
    """Resultado de UM trecho, na ordem original da requisição."""

    index: int
    request: SearchRequest
    status: str = "failed"  # ok | empty | failed | timeout
    report: SearchReport | None = None
    error_code: str = ""
    error_message: str = ""
    retriable: bool = False


@dataclass
class LegChoice:
    """Uma escolha reservável (ou indicativa) de um trecho, para o beam search."""

    leg_index: int
    offer: FlightOffer
    offer_key: str
    option_key: str | None  # None = escolha sintética (tarifa indicativa)
    strategy: str
    cash_brl: float
    miles: int
    effective_brl: float
    duration_min: int
    indicative: bool
    note: str = ""


@dataclass
class Itinerary:
    """Uma combinação de jornada: uma escolha por trecho."""

    id: str
    selections: list[LegChoice]
    cash_brl: float
    miles: int
    effective_total_brl: float
    duration_min: int
    miles_shortfall: int
    notes: list[str] = field(default_factory=list)


@dataclass
class MultiCityReport:
    legs: list[LegOutcome]
    itineraries: list[Itinerary]
    agent_log: list[str]
    partial: bool
    wall_seconds: float


def _duration_of(offer: FlightOffer) -> int:
    raw = offer.raw or {}
    try:
        return max(0, int(raw.get("duration_min") or 0))
    except (TypeError, ValueError):
        return 0


def leg_choices(
    outcome: LegOutcome, *, top_n: int
) -> list[LegChoice]:
    """Escolhas de um trecho: opções de compra reais primeiro; sem nenhuma,
    UMA escolha sintética em dinheiro por oferta indicativa (a mais barata).
    Deduplicadas por (offerKey, strategy); nunca entre trechos diferentes."""
    if outcome.report is None:
        return []
    report = outcome.report
    offers_by_key: dict[str, list[FlightOffer]] = {}
    for offer in report.offers:
        offers_by_key.setdefault(offer.itinerary_key(), []).append(offer)

    best: dict[tuple[str, str], LegChoice] = {}
    for option in report.options:
        candidates = offers_by_key.get(option.offer_key) or []
        # associação explícita opção→voo: mesma chave de itinerário e, quando
        # possível, a MESMA cabine final da opção (testada em test_multicity)
        offer = next(
            (o for o in candidates if o.cabin == option.cabin_final), None
        ) or (candidates[0] if candidates else None)
        if offer is None:
            continue
        choice = LegChoice(
            leg_index=outcome.index,
            offer=offer,
            offer_key=option.offer_key,
            option_key=f"{option.strategy.value}:{option.offer_key}",
            strategy=option.strategy.value,
            cash_brl=round(option.cash_brl, 2),
            miles=int(option.miles),
            effective_brl=round(option.effective_total_brl, 2),
            duration_min=_duration_of(offer),
            indicative=bool((offer.raw or {}).get("indicative")),
            note="",
        )
        key = (choice.offer_key, choice.strategy)
        kept = best.get(key)
        if kept is None or choice.effective_brl < kept.effective_brl:
            best[key] = choice

    if not best:
        # tarifas indicativas com preço mas sem opção calculada: uma escolha
        # sintética em dinheiro, claramente marcada. Sem inventar milhas,
        # upgrade, assentos ou disponibilidade.
        priced = [
            o for o in report.offers
            if o.price_cash_brl is not None and o.price_cash_brl > 0
        ]
        priced.sort(key=lambda o: o.price_cash_brl or 9e12)
        for offer in priced[:top_n]:
            choice = LegChoice(
                leg_index=outcome.index,
                offer=offer,
                offer_key=offer.itinerary_key(),
                option_key=None,
                strategy=INDICATIVE_CASH,
                cash_brl=round(offer.price_cash_brl or 0.0, 2),
                miles=0,
                effective_brl=round(offer.price_cash_brl or 0.0, 2),
                duration_min=_duration_of(offer),
                indicative=True,
                note="tarifa indicativa — confirme no canal de reserva",
            )
            key = (choice.offer_key, choice.strategy)
            if key not in best:
                best[key] = choice

    ranked = sorted(
        best.values(), key=lambda c: (c.effective_brl, c.duration_min, c.offer_key)
    )
    return ranked[: max(1, top_n)]


def _itinerary_id(selections: list[LegChoice]) -> str:
    seed = "|".join(
        f"{c.leg_index}:{c.offer_key}:{c.strategy}" for c in selections
    )
    return hashlib.sha1(seed.encode()).hexdigest()[:12]


def combine_itineraries(
    outcomes: list[LegOutcome],
    *,
    top_choices_per_leg: int,
    max_itineraries: int,
    miles_balance: int,
) -> list[Itinerary]:
    """Beam search sobre as escolhas por trecho — nunca o produto cartesiano.

    O déficit de milhas é calculado UMA vez sobre o total da combinação
    (o mesmo saldo não é reutilizado integralmente em cada trecho)."""
    per_leg = [
        leg_choices(outcome, top_n=top_choices_per_leg) for outcome in outcomes
    ]
    if any(not choices for choices in per_leg):
        return []  # jornada completa exige ao menos uma escolha por trecho

    beam_width = max(1, max_itineraries)
    combos: list[list[LegChoice]] = [[]]
    for choices in per_leg:
        expanded = [combo + [choice] for combo in combos for choice in choices]
        expanded.sort(
            key=lambda combo: (
                round(sum(c.effective_brl for c in combo), 2),
                sum(c.duration_min for c in combo),
                round(sum(c.cash_brl for c in combo), 2),
                sum(c.miles for c in combo),
                _itinerary_id(combo),
            )
        )
        combos = expanded[:beam_width]

    itineraries: list[Itinerary] = []
    for combo in combos:
        total_miles = sum(c.miles for c in combo)
        notes = [
            "Combinação de trechos reservados separadamente — não representa "
            "tarifa única, PNR único ou conexões protegidas."
        ]
        if any(c.indicative for c in combo):
            notes.append(
                "Inclui tarifa(s) indicativa(s) do metasearch — confirme no "
                "canal de reserva."
            )
        itineraries.append(
            Itinerary(
                id=_itinerary_id(combo),
                selections=combo,
                cash_brl=round(sum(c.cash_brl for c in combo), 2),
                miles=total_miles,
                effective_total_brl=round(
                    sum(c.effective_brl for c in combo), 2
                ),
                duration_min=sum(c.duration_min for c in combo),
                miles_shortfall=max(0, total_miles - max(0, miles_balance)),
                notes=notes,
            )
        )
    itineraries.sort(
        key=lambda i: (
            i.effective_total_brl, i.duration_min, i.cash_brl, i.miles, i.id
        )
    )
    return itineraries[:max_itineraries]


class MultiCityOrchestrator:
    """Compõe o ``Orchestrator`` existente — não duplica providers, scrapers,
    auditoria, flex-scout nem matemática de milhas."""

    def __init__(self, settings: Settings):
        self.settings = settings

    async def search(self, requests: list[SearchRequest]) -> MultiCityReport:
        started = time.monotonic()
        s = self.settings
        total = len(requests)
        # semáforo GLOBAL de subagentes: compartilhado por todos os trechos
        shared_semaphore = asyncio.Semaphore(s.max_subagents)
        leg_gate = asyncio.Semaphore(max(1, s.multicity_max_concurrent_legs))
        scrape_budget = max(1, s.multicity_max_scrapes // max(1, total))

        outcomes = [
            LegOutcome(index=i, request=req) for i, req in enumerate(requests)
        ]
        agent_log: list[str] = [
            f"jornada multidestinos: {total} trecho(s), orçamento de scraping "
            f"{s.multicity_max_scrapes} (≈{scrape_budget}/trecho), "
            f"{s.multicity_max_concurrent_legs} trecho(s) em paralelo"
        ]

        async def run_leg(outcome: LegOutcome) -> None:
            req = outcome.request
            label = f"[trecho {outcome.index + 1} {req.origin}→{req.destination}]"
            leg_settings = replace(s, scrape_hard_cap=scrape_budget)
            orchestrator = Orchestrator(leg_settings)
            # o contexto do trecho usa o semáforo compartilhado da jornada
            orchestrator.ctx._semaphore = shared_semaphore
            async with leg_gate:
                try:
                    report = await asyncio.wait_for(
                        orchestrator.search(req), timeout=s.api_search_timeout_s
                    )
                except asyncio.TimeoutError:
                    outcome.status = "timeout"
                    outcome.error_code = LEG_TIMEOUT
                    outcome.error_message = (
                        f"trecho excedeu {s.api_search_timeout_s:.0f}s"
                    )
                    outcome.retriable = True
                    return
                except asyncio.CancelledError:
                    raise
                except Exception as error:  # noqa: BLE001 - erro por trecho
                    outcome.status = "failed"
                    outcome.error_code = LEG_SEARCH_FAILED
                    detail = _redact(str(error)) or type(error).__name__
                    outcome.error_message = detail[:200]
                    outcome.retriable = True
                    return
            outcome.report = report
            outcome.status = "ok" if report.offers else "empty"
            for line in report.agent_log:
                agent_log.append(f"{label} {line}")

        tasks = [asyncio.create_task(run_leg(outcome)) for outcome in outcomes]
        done, pending = await asyncio.wait(
            tasks, timeout=s.multicity_search_timeout_s
        )
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
            # trechos cancelados pelo teto global viram timeout de jornada
            for outcome in outcomes:
                if outcome.report is None and not outcome.error_code:
                    outcome.status = "timeout"
                    outcome.error_code = MULTICITY_TIMEOUT
                    outcome.error_message = (
                        f"jornada excedeu {s.multicity_search_timeout_s:.0f}s"
                    )
                    outcome.retriable = True
        # exceções inesperadas do próprio run_leg (não deveriam ocorrer)
        for task, outcome in zip(tasks, outcomes):
            if task in done and task.exception() is not None:
                error = task.exception()
                outcome.status = "failed"
                outcome.error_code = LEG_SEARCH_FAILED
                outcome.error_message = (
                    (_redact(str(error)) or type(error).__name__)[:200]
                )
                outcome.retriable = True

        miles_balance = requests[0].miles_balance if requests else 0
        itineraries = combine_itineraries(
            outcomes,
            top_choices_per_leg=s.multicity_top_choices_per_leg,
            max_itineraries=s.multicity_max_itineraries,
            miles_balance=miles_balance,
        )
        succeeded = sum(1 for o in outcomes if o.report is not None)
        partial = 0 < succeeded < total
        agent_log.append(
            f"jornada concluída: {succeeded}/{total} trecho(s) com resposta, "
            f"{len(itineraries)} combinação(ões)"
        )
        return MultiCityReport(
            legs=outcomes,
            itineraries=itineraries,
            agent_log=agent_log,
            partial=partial,
            wall_seconds=round(time.monotonic() - started, 2),
        )
