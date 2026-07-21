"""Azul Linhas Aéreas (AD) — malha a partir dos hubs VCP/CNF/REC.

Curadoria manual: a Azul domina Viracopos (VCP) e Confins (CNF), com
internacional para Flórida e Lisboa. Edite as tuplas para acompanhar
mudanças de malha.
"""

from __future__ import annotations

from ..models import Route

CARRIER = "AD"

#: (origin, destination) nonstop pairs — one direction; reverse is generated.
NONSTOP_PAIRS: tuple[tuple[str, str], ...] = (
    # Hub VCP (Campinas)
    ("VCP", "SDU"), ("VCP", "CNF"), ("VCP", "REC"), ("VCP", "SSA"),
    ("VCP", "POA"), ("VCP", "CWB"), ("VCP", "FLN"), ("VCP", "BSB"),
    ("VCP", "GIG"), ("VCP", "MAO"), ("VCP", "BEL"), ("VCP", "FOR"),
    ("VCP", "MCZ"), ("VCP", "NAT"), ("VCP", "VIX"), ("VCP", "CGB"),
    ("VCP", "CGR"), ("VCP", "GYN"), ("VCP", "IGU"),
    # Hub CNF (Confins)
    ("CNF", "SDU"), ("CNF", "GIG"), ("CNF", "BSB"), ("CNF", "SSA"),
    ("CNF", "REC"), ("CNF", "POA"), ("CNF", "CWB"), ("CNF", "FOR"),
    ("CNF", "MAO"), ("CNF", "VIX"),
    # Hub REC (Recife)
    ("REC", "NAT"), ("REC", "MCZ"), ("REC", "FOR"), ("REC", "FEN"),
    ("REC", "JPA"),
    # Internacional
    ("VCP", "FLL"), ("VCP", "MCO"), ("VCP", "LIS"), ("REC", "FLL"),
    ("VCP", "MVD"), ("VCP", "PUJ"),
)

#: Hubs usable as connection points for pairs we don't fly nonstop.
HUBS: tuple[str, ...] = ("VCP", "CNF", "REC")


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
    """AD options: nonstop when in the network, else one-stop via a hub."""
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
