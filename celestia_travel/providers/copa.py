"""Adaptador para um endpoint parceiro da Copa Airlines.

A Copa não oferece API pública de tarifas; a integração real depende de um
endpoint de parceiro/NDC contratado. Este adaptador define o contrato: aponte
``COPA_API_URL`` para um endpoint que aceite ``GET ?origin=&destination=&date=``
e devolva JSON no formato::

    {"offers": [{"airline": "Copa Airlines", "flight_number": "CM702",
                 "depart_time": "08:15", "duration_minutes": 410, "stops": 0,
                 "price": 2890.90, "taxes": 210.55,
                 "miles_price": 112000, "miles_program": "ConnectMiles"}]}

Sem o endpoint configurado, levanta :class:`ProviderNotConfigured` — o
scraping por regex do HTML público (abordagem do protótipo antigo) não
funciona, pois o site é renderizado via JavaScript.
"""
from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.parse
import urllib.request

from celestia_travel.models import FlightOffer, SearchTask
from celestia_travel.providers.base import (
    FlightProvider,
    ProviderError,
    ProviderNotConfigured,
)

_TIMEOUT_SECONDS = 20


class CopaProvider(FlightProvider):
    name = "copa"

    def __init__(self, api_url: str | None) -> None:
        self._api_url = (api_url or "").strip() or None

    async def search(self, task: SearchTask) -> list[FlightOffer]:
        if self._api_url is None:
            raise ProviderNotConfigured(
                "Copa requer COPA_API_URL (endpoint de parceiro/NDC contratado)."
            )
        return await asyncio.to_thread(self._search_sync, task)

    def _search_sync(self, task: SearchTask) -> list[FlightOffer]:
        params = urllib.parse.urlencode(
            {
                "origin": task.origin,
                "destination": task.destination,
                "date": task.depart_date.isoformat(),
                "passengers": task.passengers,
                "cabin": task.cabin.value,
            }
        )
        url = f"{self._api_url}?{params}"

        try:
            with urllib.request.urlopen(url, timeout=_TIMEOUT_SECONDS) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise ProviderError(f"Endpoint Copa respondeu HTTP {error.code}.") from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ProviderError(f"Falha ao consultar o endpoint Copa: {error}") from error

        raw_offers = body.get("offers")
        if not isinstance(raw_offers, list):
            raise ProviderError("Resposta do endpoint Copa sem a lista 'offers'.")

        offers: list[FlightOffer] = []
        for raw in raw_offers:
            try:
                offers.append(
                    FlightOffer(
                        provider=self.name,
                        airline=str(raw.get("airline", "Copa Airlines")),
                        flight_number=str(raw["flight_number"]),
                        origin=task.origin,
                        destination=task.destination,
                        depart_date=task.depart_date,
                        depart_time=str(raw.get("depart_time", "—")),
                        duration_minutes=int(raw.get("duration_minutes", 0)),
                        stops=int(raw.get("stops", 0)),
                        price_cash=float(raw["price"]),
                        taxes=float(raw.get("taxes", 0.0)),
                        miles_price=(
                            int(raw["miles_price"]) if raw.get("miles_price") else None
                        ),
                        miles_program=raw.get("miles_program"),
                        deep_link=raw.get("deep_link"),
                    )
                )
            except (KeyError, TypeError, ValueError) as error:
                raise ProviderError(
                    f"Oferta em formato inesperado no endpoint Copa: {raw!r}"
                ) from error

        return offers
