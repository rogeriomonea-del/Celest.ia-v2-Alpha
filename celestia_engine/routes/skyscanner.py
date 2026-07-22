"""Rotas cobertas via metasearch (Skyscanner).

Duas fontes:
1. Curadoria estática das rotas mais pesquisadas que o celest.ia já cobre
   pelo Skyscanner (funciona sem chave de API).
2. Descoberta dinâmica via Skyscanner Partners quando SKYSCANNER_API_KEY
   estiver configurada (feita pelo provider em tempo de busca).
"""

from __future__ import annotations

from ..models import Route

CARRIER = "*"  # metasearch: any carrier

POPULAR_PAIRS: tuple[tuple[str, str], ...] = (
    ("GRU", "LIS"), ("GRU", "OPO"), ("GRU", "MAD"), ("GRU", "BCN"),
    ("GRU", "CDG"), ("GRU", "LHR"), ("GRU", "FCO"), ("GRU", "AMS"),
    ("GRU", "MIA"), ("GRU", "MCO"), ("GRU", "JFK"), ("GRU", "YYZ"),
    ("GRU", "CUN"), ("GRU", "SCL"), ("GRU", "EZE"), ("GRU", "BOG"),
    ("GRU", "LIM"), ("GRU", "PTY"), ("GRU", "DXB"), ("GRU", "IST"),
    ("GIG", "LIS"), ("GIG", "MIA"), ("GIG", "EZE"), ("GIG", "PTY"),
    ("BSB", "LIS"), ("BSB", "MIA"), ("BSB", "PTY"),
    ("CNF", "LIS"), ("CNF", "PTY"), ("POA", "LIS"), ("REC", "LIS"),
    ("FOR", "LIS"), ("VCP", "LIS"),
)


def all_routes() -> list[Route]:
    routes: list[Route] = []
    for origin, destination in POPULAR_PAIRS:
        routes.append(Route(origin, destination, CARRIER, direct=True))
        routes.append(Route(destination, origin, CARRIER, direct=True))
    return routes


def routes_between(origin: str, destination: str) -> list[Route]:
    """Metasearch can quote any pair — always returns one catch-all route."""
    origin, destination = origin.upper(), destination.upper()
    if origin == destination:
        return []
    return [Route(origin, destination, CARRIER, direct=True)]
