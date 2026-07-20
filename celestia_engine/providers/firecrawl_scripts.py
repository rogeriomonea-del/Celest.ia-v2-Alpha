"""Scripts (playbooks) do Firecrawl Interact — fluxos nomeados e reutilizáveis.

Cada **Script** é um playbook declarativo: uma sequência de passos em linguagem
natural + uma extração estruturada **rica** (voo, horários, conexões, aeronave,
bagagem, milhas — não só o preço). A IA orquestradora enumera os scripts, testa
qual entrega mais dados por site e registra o desempenho no CSV de
self-improvement (`data/strategy_performance.csv`), convergindo para o melhor.

Scripts disponíveis:

| nome                     | tipo     | alvo                      | o que faz |
|--------------------------|----------|---------------------------|-----------|
| ``copa_direct``          | offers   | copaair.com               | busca direto na Copa (ConnectMiles): dinheiro **e** milhas |
| ``latam_direct``         | offers   | latamairlines.com         | busca direto na LATAM (LATAM Pass): dinheiro **e** milhas |
| ``google_flights_search``| offers   | google.com/travel/flights | metasearch: extrai voos de **várias** companhias de uma vez |
| ``google_flights_calendar``| calendar| google.com/travel/flights | varre o calendário de preços p/ cortar datas caras |

Os primitivos de sessão (open/interact/close) e os parsers vivem em
``firecrawl_interact``; aqui ficam os **playbooks** e o executor genérico.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ..config import Settings
from ..models import Cabin, DatePrice, FlightOffer, Route, Source
from .base import ProviderError, ProviderNotConfigured
from .firecrawl_interact import (
    _CABIN_GF,
    close_session,
    interact,
    open_session,
    parse_calendar_output,
    parse_interact_output,
)

# ---------------------------------------------------------------- extração rica
#: Formato pedido ao LLM na extração de ofertas. Vai muito além do preço:
#: companhia, número do voo, cabine, família tarifária, milhas, impostos,
#: horários, duração, conexões (aeroporto + tempo), aeronave e bagagem.
OFFER_SCHEMA_HINT = (
    "Responda APENAS com JSON válido, sem nenhum texto ao redor, no formato:\n"
    '{"offers":[{'
    '"airline":"COPA","airline_iata":"CM","flight_numbers":["CM 702","CM 480"],'
    '"cabin":"economy","fare_brand":"Classic",'
    '"price":1226,"currency":"USD","price_miles":60000,"taxes":180,'
    '"departure_time":"01:40","arrival_time":"11:20","arrival_day_offset":0,'
    '"duration_minutes":680,"stops":1,'
    '"layovers":[{"airport":"PTY","minutes":95}],'
    '"aircraft":"Boeing 737-800","baggage":{"carry_on":true,"checked":1},'
    '"seats_left":5}]}.\n'
    "Regras: extraia TODAS as opções visíveis (todas as companhias e todas as "
    "cabines). cabin deve ser 'economy', 'premium' ou 'business'. currency é o "
    "código ISO (USD/BRL). price_miles só quando o site mostrar emissão em "
    "milhas/pontos; senão null. Preencha o máximo de campos possível e use null "
    "quando o dado não existir. Não invente valores."
)


# ----------------------------------------------------------- passos por script
def _copa_steps(*, route: Route, depart, cabin: Cabin = Cabin.ECONOMY, **_) -> list[str]:
    depart_br = f"{depart.day:02d}/{depart.month:02d}/{depart.year}"
    return [
        f"1. No campo de origem digite {route.origin}. "
        f"2. No campo de destino digite {route.destination}. "
        "Selecione a primeira sugestão de cada campo.",
        f"Defina somente ida com data de partida {depart_br}. "
        "Confirme 1 adulto e pesquise os voos.",
        "Aguarde os resultados carregarem por completo — todas as companhias, "
        "horários, conexões e preços (em dinheiro e, se houver, em milhas). "
        + OFFER_SCHEMA_HINT,
    ]


def _latam_steps(*, route: Route, depart, cabin: Cabin = Cabin.ECONOMY, **_) -> list[str]:
    depart_iso = depart.isoformat()
    return [
        f"1. No campo de origem digite {route.origin}. "
        f"2. No campo de destino digite {route.destination}. "
        "Selecione a primeira sugestão de cada campo.",
        f"Escolha somente ida, data {depart_iso}, 1 adulto, e pesquise. "
        "Se aparecer a opção de ver preços em pontos LATAM Pass, ative-a.",
        "Aguarde a lista de voos carregar por completo, com horários, conexões, "
        "preços em dinheiro e em pontos. " + OFFER_SCHEMA_HINT,
    ]


def _google_flights_search_steps(
    *, route: Route, depart, cabin: Cabin = Cabin.ECONOMY, **_
) -> list[str]:
    return [
        "1. Selecione 'Somente ida'. "
        f"2. Origem {route.origin}, destino {route.destination}. "
        f"3. Classe {_CABIN_GF[cabin]}. 4. Data de ida {depart.isoformat()}. "
        "Selecione a primeira sugestão de cada campo e pesquise.",
        "Aguarde carregar TODOS os resultados de TODAS as companhias. "
        "Para cada voo leia companhia, número, horários, duração, escalas e "
        "preço. " + OFFER_SCHEMA_HINT,
    ]


def _google_flights_calendar_steps(
    *, origin: str, destination: str, cabin: Cabin, start, end, **_
) -> list[str]:
    return [
        "1. Selecione 'Somente ida'. "
        f"2. Origem {origin}, destino {destination}. "
        f"3. Classe {_CABIN_GF[cabin]}. Selecione a primeira sugestão de cada campo.",
        "Abra o seletor de datas / calendário de preços e leia o preço de cada "
        f"data. Considere apenas datas entre {start.isoformat()} e {end.isoformat()}. "
        "Responda APENAS com JSON válido no formato "
        '{"calendar":[{"date":"2026-09-20","price":1562,"currency":"BRL"}]}. '
        "currency é o código ISO (BRL/USD). Não invente datas sem preço.",
    ]


@dataclass(frozen=True)
class FirecrawlScript:
    """Um playbook nomeado do Firecrawl Interact."""

    name: str
    description: str
    kind: str  # "offers" | "calendar"
    url_key: str  # atributo de Settings que guarda a URL alvo
    build_steps: Callable[..., list[str]]

    def url(self, settings: Settings) -> str:
        return getattr(settings, self.url_key)


SCRIPTS: dict[str, FirecrawlScript] = {
    "copa_direct": FirecrawlScript(
        "copa_direct", "Busca direto na Copa Airlines (dinheiro e ConnectMiles)",
        "offers", "copa_interact_url", _copa_steps,
    ),
    "latam_direct": FirecrawlScript(
        "latam_direct", "Busca direto na LATAM (dinheiro e LATAM Pass)",
        "offers", "latam_interact_url", _latam_steps,
    ),
    "google_flights_search": FirecrawlScript(
        "google_flights_search",
        "Metasearch no Google Flights: voos e preços de várias companhias",
        "offers", "google_flights_interact_url", _google_flights_search_steps,
    ),
    "google_flights_calendar": FirecrawlScript(
        "google_flights_calendar",
        "Varre o calendário de preços do Google Flights (corta datas caras)",
        "calendar", "google_flights_interact_url", _google_flights_calendar_steps,
    ),
}

#: site da companhia → script de busca direta.
SITE_SCRIPT: dict[str, str] = {"copa": "copa_direct", "latam": "latam_direct"}


# --------------------------------------------------------------------- executor
def _require_firecrawl(settings: Settings) -> None:
    if not settings.has_firecrawl():
        raise ProviderNotConfigured("FIRECRAWL_API_KEY ausente — Interact desativado")
    if not settings.firecrawl_interact_enabled:
        raise ProviderNotConfigured("FIRECRAWL_INTERACT=0 — modo Interact desativado")


async def _run_steps(settings: Settings, url: str, steps: list[str]) -> str:
    """Abre uma sessão, encadeia os passos (reusa o scrapeId) e sempre encerra.
    Retorna a saída do ÚLTIMO passo (a extração)."""
    scrape_id = await open_session(settings, url)
    last = ""
    try:
        for step in steps:
            last = await interact(settings, scrape_id, step)
    finally:
        await close_session(settings, scrape_id)
    return last


async def run_offer_script(
    settings: Settings,
    script_name: str,
    *,
    carrier: str,
    program: str,
    source: Source,
    route: Route,
    depart,
    cabin: Cabin = Cabin.ECONOMY,
) -> list[FlightOffer]:
    """Executa um script de ofertas e devolve FlightOffers com dados ricos."""
    script = SCRIPTS.get(script_name)
    if script is None or script.kind != "offers":
        raise ProviderError(f"script de ofertas desconhecido: {script_name!r}")
    _require_firecrawl(settings)
    steps = script.build_steps(route=route, depart=depart, cabin=cabin)
    raw = await _run_steps(settings, script.url(settings), steps)
    offers = parse_interact_output(
        raw, carrier=carrier, program=program, route=route, depart=depart,
        source=source, usd_brl_rate=settings.usd_brl_rate,
    )
    if not offers:
        raise ProviderError(
            f"firecrawl script {script_name} {route.key()}: extração vazia "
            f"(output: {raw[:120]!r})"
        )
    return offers


async def run_google_flights_offers(
    settings: Settings, *, route: Route, depart, cabin: Cabin = Cabin.ECONOMY
) -> list[FlightOffer]:
    """Metasearch no Google Flights: ofertas de várias companhias (indicativas).

    O carrier de cada oferta vem da própria extração (``airline_iata``/rótulo);
    ``"*"`` é só o padrão quando a companhia não pôde ser identificada.
    """
    return await run_offer_script(
        settings, "google_flights_search",
        carrier="*", program="", source=Source.GOOGLE_FLIGHTS,
        route=route, depart=depart, cabin=cabin,
    )


async def run_calendar_script(
    settings: Settings,
    *,
    origin: str,
    destination: str,
    cabin: Cabin,
    start,
    end,
    script_name: str = "google_flights_calendar",
) -> list[DatePrice]:
    """Executa o script de calendário e devolve o preço por data."""
    script = SCRIPTS.get(script_name)
    if script is None or script.kind != "calendar":
        raise ProviderError(f"script de calendário desconhecido: {script_name!r}")
    _require_firecrawl(settings)
    steps = script.build_steps(
        origin=origin, destination=destination, cabin=cabin, start=start, end=end
    )
    raw = await _run_steps(settings, script.url(settings), steps)
    return parse_calendar_output(raw, usd_brl_rate=settings.usd_brl_rate)
