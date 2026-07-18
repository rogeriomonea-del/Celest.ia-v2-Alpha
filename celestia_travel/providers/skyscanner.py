"""Adaptador para a API oficial de parceiros do Skyscanner.

Usa o endpoint de *indicative prices* (v3), que retorna as menores tarifas
por rota/data. Requer chave de parceiro em ``SKYSCANNER_API_KEY`` — sem a
chave, o provedor levanta :class:`ProviderNotConfigured` e o orquestrador o
ignora com aviso (nunca inventa dados). Scraping do site não é suportado:
além de violar os termos de uso, as páginas são renderizadas via JavaScript
e bloqueiam clientes automatizados.
"""
from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request

from celestia_travel.models import FlightOffer, SearchTask
from celestia_travel.providers.base import (
    FlightProvider,
    ProviderError,
    ProviderNotConfigured,
)

_ENDPOINT = (
    "https://partners.api.skyscanner.net/apiservices/v3/flights/indicative/search"
)
_TIMEOUT_SECONDS = 20


class SkyscannerProvider(FlightProvider):
    name = "skyscanner"

    def __init__(self, api_key: str | None) -> None:
        self._api_key = (api_key or "").strip() or None

    async def search(self, task: SearchTask) -> list[FlightOffer]:
        if self._api_key is None:
            raise ProviderNotConfigured(
                "Skyscanner requer SKYSCANNER_API_KEY (chave do programa de parceiros)."
            )
        return await asyncio.to_thread(self._search_sync, task)

    def _search_sync(self, task: SearchTask) -> list[FlightOffer]:
        payload = {
            "query": {
                "market": "BR",
                "locale": "pt-BR",
                "currency": "BRL",
                "queryLegs": [
                    {
                        "originPlace": {
                            "queryPlace": {"iata": task.origin}
                        },
                        "destinationPlace": {
                            "queryPlace": {"iata": task.destination}
                        },
                        "fixedDate": {
                            "year": task.depart_date.year,
                            "month": task.depart_date.month,
                            "day": task.depart_date.day,
                        },
                    }
                ],
            }
        }

        request = urllib.request.Request(
            _ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": self._api_key or "",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise ProviderError(
                f"Skyscanner respondeu HTTP {error.code} para {task.origin}-{task.destination}."
            ) from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ProviderError(f"Falha ao consultar o Skyscanner: {error}") from error

        return self._parse(body, task)

    def _parse(self, body: dict, task: SearchTask) -> list[FlightOffer]:
        content = body.get("content", {})
        results = content.get("results", {})
        quotes: dict = results.get("quotes", {})
        carriers: dict = results.get("carriers", {})

        offers: list[FlightOffer] = []
        for quote_id, quote in quotes.items():
            try:
                price_info = quote["minPrice"]
                amount = float(price_info["amount"])
                unit = price_info.get("unit", "PRICE_UNIT_WHOLE")
                if unit == "PRICE_UNIT_CENTI":
                    amount /= 100
                elif unit == "PRICE_UNIT_MILLI":
                    amount /= 1000

                leg = quote.get("outboundLeg", {})
                carrier_id = str(leg.get("marketingCarrierId", ""))
                carrier = carriers.get(carrier_id, {}).get("name", "Companhia parceira")
                direct = bool(quote.get("isDirect", False))
            except (KeyError, TypeError, ValueError) as error:
                raise ProviderError(
                    f"Resposta do Skyscanner em formato inesperado (quote {quote_id})."
                ) from error

            offers.append(
                FlightOffer(
                    provider=self.name,
                    airline=carrier,
                    flight_number=f"SKY-{quote_id[:8]}",
                    origin=task.origin,
                    destination=task.destination,
                    depart_date=task.depart_date,
                    depart_time="—",
                    duration_minutes=0,
                    stops=0 if direct else 1,
                    price_cash=round(amount, 2),
                    taxes=0.0,
                    deep_link=(
                        "https://www.skyscanner.com.br/transport/flights/"
                        f"{task.origin.lower()}/{task.destination.lower()}/"
                        f"{task.depart_date.strftime('%y%m%d')}/"
                    ),
                )
            )

        return offers
