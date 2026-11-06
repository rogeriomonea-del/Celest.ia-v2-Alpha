"""Deterministic mock providers — offline dev, tests and `--mock` demos.

Prices are a stable function of (route, date, cabin) so runs are reproducible
and assertions in tests are exact.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime

from ..models import Cabin, FareQuote, FlightOffer, Route, Source


def _seed(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(digest[:8], 16)


def _base_price(route: Route, depart: date) -> float:
    seed = _seed(route.origin, route.destination, depart.isoformat())
    return 1400.0 + (seed % 2600)  # R$ 1.400 – R$ 4.000 economy


_CABIN_MULTIPLIER = {Cabin.ECONOMY: 1.0, Cabin.PREMIUM: 1.9, Cabin.BUSINESS: 3.4}


def mock_quote(route: Route, depart: date, cabin: Cabin) -> list[FareQuote]:
    price = _base_price(route, depart) * _CABIN_MULTIPLIER[cabin]
    if not route.direct:
        price *= 0.82  # connections come out cheaper
    return [
        FareQuote(
            route=route,
            depart=depart,
            cabin=cabin,
            price_brl=round(price, 2),
            source=Source.MOCK,
            fetched_at=datetime.utcnow(),
        )
    ]


#: companhias que o metasearch mock devolve (rotativo, determinístico).
#: HA e S4 NÃO estão no registro curado de propósito: exercitam o fluxo de
#: descoberta (airlines_discovered.csv) nas rodadas offline.
_META_CARRIERS = [("G3", "GOL"), ("AD", "Azul"), ("TP", "TAP Air Portugal"),
                  ("AA", "American Airlines"), ("AF", "Air France"),
                  ("CM", "Copa Airlines"), ("IB", "Iberia"),
                  ("UA", "United Airlines"), ("EK", "Emirates"),
                  ("TK", "Turkish Airlines"), ("HA", "Hawaiian Airlines"),
                  ("S4", "Azores Airlines")]


def mock_metasearch_offers(
    route: Route, depart: date, cabin: Cabin, n: int = 3
) -> list[FlightOffer]:
    """Voos indicativos multi-companhia, como o gf2 real devolve (premium)."""
    base = _base_price(route, depart) * _CABIN_MULTIPLIER[cabin]
    seed = _seed("meta", route.origin, route.destination, depart.isoformat())
    offers: list[FlightOffer] = []
    for index in range(max(1, n)):
        code, label = _META_CARRIERS[(seed + index) % len(_META_CARRIERS)]
        price = round(base * (0.92 + 0.07 * index), 2)
        dep_min = (5 * 60 + (seed // (index + 1)) % (16 * 60)) % (24 * 60)
        duration = 300 + (seed + index * 97) % 420
        offers.append(
            FlightOffer(
                carrier=code,
                flight_numbers=(f"{code} {100 + (seed + index) % 800}",),
                origin=route.origin,
                destination=route.destination,
                depart=depart,
                cabin=cabin,
                price_cash_brl=price,
                source=Source.MOCK,
                raw={
                    "via": "google_flights2",
                    "indicative": True,
                    "airline_label": label,
                    "departure_time": f"{dep_min // 60:02d}:{dep_min % 60:02d}",
                    "duration_min": duration,
                    "stops": index % 2,
                    "layovers": [],
                },
            )
        )
    return offers


def mock_offers(
    carrier: str, program: str, route: Route, depart: date
) -> list[FlightOffer]:
    """One economy and one business offer per itinerary, with miles pricing."""
    base = _base_price(route, depart)
    if not route.direct:
        base *= 0.82
    seed = _seed(carrier, route.origin, route.destination, depart.isoformat())
    flight_number = f"{carrier} {200 + seed % 700}"
    source = {
        "CM": Source.COPA,
        "LA": Source.LATAM,
        "G3": Source.GOL,
        "AD": Source.AZUL,
    }.get(carrier, Source.MOCK)

    economy_cash = round(base, 2)
    business_cash = round(base * _CABIN_MULTIPLIER[Cabin.BUSINESS], 2)
    taxes = round(180.0 + seed % 140, 2)
    economy_miles = int(economy_cash / 0.028)      # ~ R$28/milheiro implícito
    business_miles = int(business_cash / 0.033)    # award business rende mais
    upgrade_miles = int((business_cash - economy_cash) / 0.045)  # upgrades rendem menos
    upgrade_cash = round((business_cash - economy_cash) * 0.72, 2)

    common = dict(
        carrier=carrier,
        origin=route.origin,
        destination=route.destination,
        depart=depart,
        taxes_brl=taxes,
        miles_program=program,
        source=source,
    )
    return [
        FlightOffer(
            flight_numbers=(flight_number,),
            cabin=Cabin.ECONOMY,
            price_cash_brl=economy_cash,
            price_miles=economy_miles,
            upgrade_miles=upgrade_miles,
            upgrade_cash_brl=upgrade_cash,
            seats_left=3 + seed % 6,
            **common,
        ),
        FlightOffer(
            flight_numbers=(flight_number,),
            cabin=Cabin.BUSINESS,
            price_cash_brl=business_cash,
            price_miles=business_miles,
            seats_left=1 + seed % 4,
            **common,
        ),
    ]
