"""LATAM Airlines (LA) route network — recorte Brasil + troncos internacionais.

Curadoria manual dos principais mercados a partir dos hubs GRU/GIG/BSB e SCL.
Edite as tuplas para acompanhar mudanças de malha.
"""

from __future__ import annotations

from ..models import Route

CARRIER = "LA"

#: (origin, destination) nonstop pairs — one direction; reverse is generated.
NONSTOP_PAIRS: tuple[tuple[str, str], ...] = (
    # GRU internacional
    ("GRU", "LIS"), ("GRU", "MAD"), ("GRU", "BCN"), ("GRU", "CDG"),
    ("GRU", "LHR"), ("GRU", "FRA"), ("GRU", "MXP"), ("GRU", "FCO"),
    ("GRU", "JFK"), ("GRU", "BOS"), ("GRU", "MIA"), ("GRU", "MCO"),
    ("GRU", "LAX"), ("GRU", "SCL"), ("GRU", "EZE"), ("GRU", "LIM"),
    ("GRU", "BOG"), ("GRU", "MVD"), ("GRU", "ASU"), ("GRU", "JNB"),
    # GIG
    ("GIG", "MIA"), ("GIG", "SCL"), ("GIG", "EZE"), ("GIG", "LIM"),
    # Doméstico Brasil (troncos)
    ("GRU", "GIG"), ("GRU", "SDU"), ("GRU", "BSB"), ("GRU", "CNF"),
    ("GRU", "POA"), ("GRU", "CWB"), ("GRU", "FLN"), ("GRU", "SSA"),
    ("GRU", "REC"), ("GRU", "FOR"), ("GRU", "MAO"), ("GRU", "BEL"),
    ("GRU", "VIX"), ("GRU", "GYN"), ("GRU", "CGB"), ("GRU", "CGR"),
    ("GIG", "BSB"), ("GIG", "CNF"), ("GIG", "POA"), ("GIG", "SSA"),
    ("BSB", "REC"), ("BSB", "FOR"), ("BSB", "MAO"), ("BSB", "SSA"),
    # Hub SCL (rede LATAM Chile — recorte)
    ("SCL", "LIM"), ("SCL", "EZE"), ("SCL", "BOG"), ("SCL", "MIA"),
    ("SCL", "MAD"), ("SCL", "IPC"),
)

#: Hubs usable as connection points for pairs we don't fly nonstop.
HUBS: tuple[str, ...] = ("GRU", "SCL", "LIM")


def all_routes() -> list[Route]:
    routes: list[Route] = []
    for origin, destination in NONSTOP_PAIRS:
        routes.append(Route(origin, destination, CARRIER, direct=True))
        routes.append(Route(destination, origin, CARRIER, direct=True))
    return routes


def _nonstop_set() -> set[tuple[str, str]]:
    pairs = set(NONSTOP_PAIRS)
    pairs.update((b, a) for a, b in NONSTOP_PAIRS)
    return pairs


def routes_between(origin: str, destination: str) -> list[Route]:
    """LA options: nonstop when in the network, else one-stop via a hub."""
    origin, destination = origin.upper(), destination.upper()
    if origin == destination:
        return []
    pairs = _nonstop_set()
    if (origin, destination) in pairs:
        return [Route(origin, destination, CARRIER, direct=True)]
    for hub in HUBS:
        if hub in (origin, destination):
            continue
        if (origin, hub) in pairs and (hub, destination) in pairs:
            return [Route(origin, destination, CARRIER, direct=False, via=hub)]
    return []
