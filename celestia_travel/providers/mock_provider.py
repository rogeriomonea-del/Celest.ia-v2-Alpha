"""Provedor determinístico para demonstração offline e testes.

Gera ofertas realistas e **reprodutíveis**: a mesma rota + data produz sempre
o mesmo conjunto de ofertas (seed derivada da tarefa). Preços seguem efeitos
reais de mercado — terças/quartas mais baratas, sextas/domingos mais caras —
e parte das ofertas traz preço em milhas com milheiro implícito variado, para
dar trabalho de verdade ao agente de avaliação.
"""
from __future__ import annotations

import hashlib
import random

from celestia_travel.models import CabinClass, FlightOffer, SearchTask
from celestia_travel.providers.base import FlightProvider

_AIRLINES: list[tuple[str, str, str]] = [
    # (companhia, prefixo de voo, programa de milhas)
    ("LATAM", "LA", "LATAM Pass"),
    ("GOL", "G3", "Smiles"),
    ("Azul", "AD", "TudoAzul"),
    ("Copa Airlines", "CM", "ConnectMiles"),
    ("American Airlines", "AA", "AAdvantage"),
]

_CABIN_MULTIPLIER = {
    CabinClass.ECONOMY: 1.0,
    CabinClass.PREMIUM: 1.9,
    CabinClass.BUSINESS: 3.4,
}

# Efeito dia-da-semana sobre a tarifa (segunda=0 ... domingo=6)
_WEEKDAY_FACTOR = [1.02, 0.92, 0.90, 1.00, 1.10, 1.04, 1.08]


class MockProvider(FlightProvider):
    name = "demo"

    async def search(self, task: SearchTask) -> list[FlightOffer]:
        seed_material = (
            f"{task.origin}|{task.destination}|{task.depart_date.isoformat()}|{task.cabin.value}"
        )
        seed = int(hashlib.sha256(seed_material.encode()).hexdigest()[:12], 16)
        rng = random.Random(seed)

        route_seed = int(
            hashlib.sha256(f"{task.origin}|{task.destination}".encode()).hexdigest()[:8], 16
        )
        route_rng = random.Random(route_seed)
        # Tarifa-base da rota (estável por rota): R$ 380 a R$ 2.600
        base_fare = 380 + route_rng.random() * 2220
        base_duration = 70 + int(route_rng.random() * 620)

        weekday_factor = _WEEKDAY_FACTOR[task.depart_date.weekday()]
        cabin_factor = _CABIN_MULTIPLIER[task.cabin]

        offers: list[FlightOffer] = []
        count = rng.randint(3, 6)
        airlines = rng.sample(_AIRLINES, k=min(count, len(_AIRLINES)))
        while len(airlines) < count:
            airlines.append(rng.choice(_AIRLINES))

        for airline, prefix, program in airlines:
            stops = rng.choices([0, 1, 2], weights=[5, 4, 1])[0]
            stop_discount = {0: 1.0, 1: 0.86, 2: 0.74}[stops]
            noise = 0.85 + rng.random() * 0.4

            price = round(base_fare * weekday_factor * cabin_factor * stop_discount * noise, 2)
            taxes = round(35 + rng.random() * 120, 2)
            duration = base_duration + stops * (55 + rng.randint(0, 90))
            depart_hour = rng.randint(5, 22)
            depart_minute = rng.choice([0, 10, 20, 30, 40, 50])
            flight_number = f"{prefix}{rng.randint(1000, 9999)}"

            miles_price = None
            miles_program = None
            if rng.random() < 0.6:
                # Milheiro implícito entre R$ 14 e R$ 35 por 1.000 milhas —
                # algumas emissões valem a pena, outras não.
                implied_cpm = 14 + rng.random() * 21
                miles_price = int(round((price / implied_cpm) * 1000, -2))
                miles_program = program

            offers.append(
                FlightOffer(
                    provider=self.name,
                    airline=airline,
                    flight_number=flight_number,
                    origin=task.origin,
                    destination=task.destination,
                    depart_date=task.depart_date,
                    depart_time=f"{depart_hour:02d}:{depart_minute:02d}",
                    duration_minutes=duration,
                    stops=stops,
                    price_cash=price,
                    taxes=taxes,
                    miles_price=miles_price,
                    miles_program=miles_program,
                    deep_link=(
                        f"https://demo.celestia.local/voos/{task.origin}-{task.destination}"
                        f"/{task.depart_date.isoformat()}/{flight_number}"
                    ),
                )
            )

        return offers
