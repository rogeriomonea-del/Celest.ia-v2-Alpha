"""Lyov — planos de voo RPL do DECEA para companhias brasileiras.

API open-source (github.com/andrebrito16/lyov) publicada no RapidAPI. Retorna
os Repetitive Flight Plans oficiais: voo, companhia, rota ICAO, horários e
dias da semana. NÃO traz preços — o papel dela aqui é manter a MALHA de rotas
viva (agents/mesh.py), alimentando o catálogo com dados reais.
"""

from __future__ import annotations

from datetime import date

from ..config import Settings
from ..models import Route
from .base import ProviderNotConfigured, get_json

#: ICAO da companhia (usado pelo DECEA) → IATA usado no restante do engine.
ICAO_AIRLINE_TO_CARRIER = {"TAM": "LA", "GLO": "G3", "AZU": "AD"}

#: Aeroportos brasileiros e vizinhos relevantes: ICAO → IATA.
ICAO_TO_IATA: dict[str, str] = {
    "SBGR": "GRU", "SBSP": "CGH", "SBKP": "VCP", "SBGL": "GIG", "SBRJ": "SDU",
    "SBBR": "BSB", "SBCF": "CNF", "SBSV": "SSA", "SBRF": "REC", "SBFZ": "FOR",
    "SBPA": "POA", "SBFL": "FLN", "SBCT": "CWB", "SBEG": "MAO", "SBBE": "BEL",
    "SBVT": "VIX", "SBGO": "GYN", "SBCY": "CGB", "SBCG": "CGR", "SBSL": "SLZ",
    "SBTE": "THE", "SBJP": "JPA", "SBMO": "MCZ", "SBAR": "AJU", "SBNT": "NAT",
    "SBPS": "BPS", "SBIL": "IOS", "SBUL": "UDI", "SBRP": "RAO", "SBSJ": "SJK",
    "SBFI": "IGU", "SBLO": "LDB", "SBMG": "MGF", "SBJV": "JOI", "SBNF": "NVT",
    "SBPJ": "PMW", "SBPV": "PVH", "SBRB": "RBR", "SBBV": "BVB", "SBMQ": "MCP",
    "SBSN": "STM", "SBIZ": "IMP", "SBMA": "MAB", "SBCZ": "CZS", "SBTT": "TBT",
    # internacionais frequentes em RPL brasileiro
    "SAEZ": "EZE", "SABE": "AEP", "SCEL": "SCL", "SPJC": "LIM", "SKBO": "BOG",
    "SUMU": "MVD", "SGAS": "ASU", "MPTO": "PTY", "KMIA": "MIA", "KJFK": "JFK",
    "KMCO": "MCO", "LPPT": "LIS", "LEMD": "MAD", "LFPG": "CDG", "EGLL": "LHR",
}


async def fetch_plans(settings: Settings, *, company: str, cycle: date) -> list[dict]:
    """Raw RPL plans for one airline (ICAO code: TAM, GLO, AZU).

    O path exato não é documentado publicamente; tentamos os candidatos
    conhecidos em ordem quando o servidor responde 404/rota inexistente.
    """
    if not settings.has_lyov():
        raise ProviderNotConfigured("RAPIDAPI_KEY ausente — Lyov desativado")
    from .base import ProviderError

    candidates = [settings.lyov_path] + [
        p for p in ("/flights", "/api/flights", "/") if p != settings.lyov_path
    ]
    last_error: ProviderError | None = None
    for path in candidates:
        try:
            payload = await get_json(
                f"https://{settings.lyov_host}{path}",
                params={"company": company, "date": cycle.isoformat()},
                headers={
                    "X-RapidAPI-Key": settings.rapidapi_key,
                    "X-RapidAPI-Host": settings.lyov_host,
                },
                timeout_s=settings.http_timeout_s,
            )
            if isinstance(payload, list):
                return payload
            return payload.get("flights") or payload.get("data") or []
        except ProviderError as error:
            last_error = error
            text = str(error).lower()
            if "404" in text or "does not exist" in text:
                continue
            raise
    raise last_error if last_error else ProviderError("Lyov: nenhum path respondeu")


def plans_to_routes(plans: list[dict]) -> list[Route]:
    """Convert RPL plans into deduplicated direct Routes (IATA codes).

    Plans with airports outside the ICAO_TO_IATA map are skipped (small
    regional fields) — extend the map to widen coverage.
    """
    seen: set[tuple[str, str, str]] = set()
    routes: list[Route] = []
    for plan in plans:
        if not isinstance(plan, dict):
            continue
        airline = str(
            plan.get("company") or plan.get("airline") or plan.get("operator") or ""
        ).upper()
        carrier = ICAO_AIRLINE_TO_CARRIER.get(airline)
        origin_icao = str(plan.get("departure") or plan.get("origin") or "").upper()
        dest_icao = str(plan.get("arrival") or plan.get("destination") or "").upper()
        origin = ICAO_TO_IATA.get(origin_icao)
        destination = ICAO_TO_IATA.get(dest_icao)
        if not carrier or not origin or not destination or origin == destination:
            continue
        key = (carrier, origin, destination)
        if key in seen:
            continue
        seen.add(key)
        routes.append(Route(origin, destination, carrier, direct=True))
    return routes


def mock_plans(company: str) -> list[dict]:
    """Deterministic sample plans for offline demos/tests."""
    samples = {
        "TAM": [
            {"company": "TAM", "flightNumber": "3054", "departure": "SBGR", "arrival": "SBBR"},
            {"company": "TAM", "flightNumber": "8084", "departure": "SBGR", "arrival": "LPPT"},
            {"company": "TAM", "flightNumber": "3390", "departure": "SBGL", "arrival": "SBPA"},
        ],
        "GLO": [
            {"company": "GLO", "flightNumber": "1408", "departure": "SBSP", "arrival": "SBGL"},
            {"company": "GLO", "flightNumber": "7600", "departure": "SBGR", "arrival": "SAEZ"},
        ],
        "AZU": [
            {"company": "AZU", "flightNumber": "4104", "departure": "SBKP", "arrival": "SBCF"},
            {"company": "AZU", "flightNumber": "8700", "departure": "SBKP", "arrival": "KMCO"},
        ],
    }
    return samples.get(company, [])
