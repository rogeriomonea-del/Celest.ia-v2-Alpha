"""GOL Linhas Aéreas (G3) — malha doméstica + internacional regional.

Curadoria manual dos troncos a partir de CGH/GRU/GIG/BSB. A GOL é forte no
doméstico e voa América do Sul e Flórida. Edite as tuplas para acompanhar
mudanças de malha.
"""

from __future__ import annotations

from ..models import Route

CARRIER = "G3"

#: (origin, destination) nonstop pairs — one direction; reverse is generated.
NONSTOP_PAIRS: tuple[tuple[str, str], ...] = (
    # Ponte aérea + troncos CGH (Congonhas)
    ("CGH", "SDU"), ("CGH", "BSB"), ("CGH", "CNF"), ("CGH", "POA"),
    ("CGH", "CWB"), ("CGH", "FLN"), ("CGH", "SSA"), ("CGH", "REC"),
    ("CGH", "GYN"), ("CGH", "VIX"), ("CGH", "CGB"), ("CGH", "CGR"),
    # GRU doméstico
    ("GRU", "REC"), ("GRU", "SSA"), ("GRU", "FOR"), ("GRU", "NAT"),
    ("GRU", "MCZ"), ("GRU", "BEL"), ("GRU", "MAO"), ("GRU", "POA"),
    ("GRU", "FLN"), ("GRU", "BSB"), ("GRU", "GIG"), ("GRU", "CNF"),
    ("GRU", "CWB"), ("GRU", "SDU"),
    # GIG / BSB
    ("GIG", "BSB"), ("GIG", "SSA"), ("GIG", "REC"), ("GIG", "FOR"),
    ("BSB", "REC"), ("BSB", "FOR"), ("BSB", "SSA"), ("BSB", "MAO"),
    ("BSB", "BEL"), ("BSB", "POA"),
    # Internacional (América do Sul + Flórida)
    ("GRU", "EZE"), ("GRU", "MVD"), ("GRU", "ASU"), ("GRU", "SCL"),
    ("GIG", "EZE"), ("GRU", "MIA"), ("GRU", "MCO"),
    ("BSB", "MIA"), ("BSB", "MCO"),
)

#: Hubs usable as connection points for pairs we don't fly nonstop.
HUBS: tuple[str, ...] = ("GRU", "BSB", "GIG")


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
    """G3 options: nonstop when in the network, else one-stop via a hub."""
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
