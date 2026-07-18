"""Copa Airlines (CM) route network.

Copa opera em hub-and-spoke: praticamente toda a malha conecta via PTY
(Cidade do Panamá). A lista abaixo é a malha de destinos servidos a partir
de PTY — curada manualmente e fácil de atualizar. Qualquer par de cidades
da lista é vendável como conexão via PTY.
"""

from __future__ import annotations

from ..models import Route

CARRIER = "CM"
HUB = "PTY"

#: Destinations served nonstop from PTY (curated seed — edit freely).
PTY_DESTINATIONS: tuple[str, ...] = (
    # Brasil
    "GRU", "GIG", "BSB", "CNF", "MAO", "POA", "REC", "FOR",
    # América do Sul
    "EZE", "COR", "MDZ", "ROS", "SCL", "LIM", "CUZ", "BOG", "MDE", "CLO",
    "CTG", "BAQ", "UIO", "GYE", "CCS", "MVD", "ASU", "VVI", "GEO", "PBM",
    # América do Norte
    "MIA", "MCO", "FLL", "TPA", "JFK", "IAD", "BOS", "ORD", "LAX", "SFO",
    "LAS", "DEN", "ATL", "AUS", "YYZ", "YUL",
    # México e América Central
    "MEX", "CUN", "GDL", "MTY", "SJO", "SAL", "GUA", "MGA", "TGU", "SAP", "BZE",
    # Caribe
    "HAV", "SDQ", "PUJ", "SJU", "KIN", "MBJ", "POS", "AUA", "CUR", "BGI", "NAS",
)


def all_routes() -> list[Route]:
    """Every nonstop CM segment (PTY ⇄ spoke)."""
    routes: list[Route] = []
    for dest in PTY_DESTINATIONS:
        routes.append(Route(HUB, dest, CARRIER, direct=True))
        routes.append(Route(dest, HUB, CARRIER, direct=True))
    return routes


def routes_between(origin: str, destination: str) -> list[Route]:
    """CM options for a city pair: nonstop when it touches PTY, else via PTY."""
    origin, destination = origin.upper(), destination.upper()
    if origin == destination:
        return []
    if origin == HUB and destination in PTY_DESTINATIONS:
        return [Route(origin, destination, CARRIER, direct=True)]
    if destination == HUB and origin in PTY_DESTINATIONS:
        return [Route(origin, destination, CARRIER, direct=True)]
    if origin in PTY_DESTINATIONS and destination in PTY_DESTINATIONS:
        return [Route(origin, destination, CARRIER, direct=False, via=HUB)]
    return []
