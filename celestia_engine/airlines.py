"""Registro extenso de companhias aéreas e seus deep-links de reserva.

Hoje o scraping profundo cobre Copa e LATAM, mas o metasearch devolve voos de
DEZENAS de companhias. Este módulo é o repositório central que abrange essa
malha ampla:

* nome oficial + programa de milhas por código IATA;
* **template de deep-link de reserva** por companhia (quando estável) — usado
  pelo botão "Ver oferta" do site;
* resolução de rótulos livres ("Copa Airlines", "Azul Linhas Aéreas"…) para
  o código IATA;
* fallback universal: link de busca do Google Flights para o par/data, que
  existe para QUALQUER companhia.

Companhias que aparecerem nas buscas e não estiverem aqui são gravadas pelo
módulo de aprendizado (``storage/airline_registry.py``) em
``data/airlines_discovered.csv`` — a malha cresce sozinha a cada busca.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from urllib.parse import quote_plus


@dataclass(frozen=True)
class AirlineInfo:
    code: str
    name: str
    program: str = ""
    #: template com {origin} {destination} {date} {adults} {cabin} (ISO date)
    booking_template: str = ""


#: Malha curada — companhias relevantes para quem voa do Brasil.
AIRLINE_REGISTRY: dict[str, AirlineInfo] = {
    code: AirlineInfo(code, name, program, template)
    for code, name, program, template in [
        # --- Brasil / América do Sul ---
        ("LA", "LATAM Airlines", "latampass", ""),   # template vem do Settings
        ("G3", "GOL Linhas Aéreas", "smiles",
         "https://b2c.voegol.com.br/compra/busca-parceiros?pv=BR&tipo=DF&origem={origin}&destino={destination}&ida={date}&ADT={adults}&CHD=0&INF=0"),
        ("AD", "Azul Linhas Aéreas", "azul",
         "https://www.voeazul.com.br/br/pt/home?c%5B0%5D.ds={origin}&c%5B0%5D.std={date}&c%5B0%5D.as={destination}&p%5B0%5D.t=ADT&p%5B0%5D.c={adults}"),
        ("CM", "Copa Airlines", "connectmiles", ""),  # template vem do Settings
        ("AV", "Avianca", "lifemiles", ""),
        ("AR", "Aerolíneas Argentinas", "aerolineas_plus", ""),
        ("H2", "SKY Airline", "", ""),
        ("JA", "JetSMART", "", ""),
        # --- América do Norte ---
        ("AA", "American Airlines", "aadvantage", ""),
        ("UA", "United Airlines", "mileageplus", ""),
        ("DL", "Delta Air Lines", "skymiles", ""),
        ("AC", "Air Canada", "aeroplan", ""),
        ("AM", "Aeroméxico", "", ""),
        ("B6", "JetBlue", "trueblue", ""),
        # --- Europa ---
        ("TP", "TAP Air Portugal", "milesandgo", ""),
        ("IB", "Iberia", "iberia_plus", ""),
        ("UX", "Air Europa", "", ""),
        ("AF", "Air France", "flyingblue", ""),
        ("KL", "KLM", "flyingblue", ""),
        ("LH", "Lufthansa", "milesandmore", ""),
        ("LX", "SWISS", "milesandmore", ""),
        ("BA", "British Airways", "avios", ""),
        ("AZ", "ITA Airways", "", ""),
        # --- Oriente Médio / África / Ásia ---
        ("EK", "Emirates", "skywards", ""),
        ("QR", "Qatar Airways", "privilege_club", ""),
        ("TK", "Turkish Airlines", "milessmiles", ""),
        ("ET", "Ethiopian Airlines", "", ""),
        ("SA", "South African Airways", "", ""),
    ]
}

#: Rótulos livres (como o metasearch escreve) → código IATA.
_LABEL_TO_CODE: dict[str, str] = {
    "latam": "LA", "tam": "LA",
    "gol": "G3", "smiles": "G3",
    "azul": "AD",
    "copa": "CM",
    "avianca": "AV",
    "aerolineas": "AR", "aerolíneas": "AR",
    "sky airline": "H2", "sky ": "H2",
    "jetsmart": "JA",
    "american": "AA",
    "united": "UA",
    "delta": "DL",
    "air canada": "AC",
    "aeromexico": "AM", "aeroméxico": "AM",
    "jetblue": "B6",
    "tap": "TP",
    "iberia": "IB",
    "air europa": "UX",
    "air france": "AF",
    "klm": "KL",
    "lufthansa": "LH",
    "swiss": "LX",
    "british": "BA",
    "ita airways": "AZ", "alitalia": "AZ",
    "emirates": "EK",
    "qatar": "QR",
    "turkish": "TK",
    "ethiopian": "ET",
    "south african": "SA",
}


def resolve_carrier_label(label: str, default: str = "*") -> str:
    """"Copa Airlines" → CM. Aceita o próprio código IATA. Sem match → default."""
    text = (label or "").strip()
    if len(text) == 2 and text.isalpha():
        return text.upper()
    low = text.lower()
    for needle, code in _LABEL_TO_CODE.items():
        if needle in low:
            return code
    return default


def airline_name(code: str, fallback: str = "") -> str:
    info = AIRLINE_REGISTRY.get(code)
    return info.name if info else (fallback or code)


def google_flights_url(origin: str, destination: str, depart: date) -> str:
    """Link de busca do Google Flights — existe para qualquer par/data."""
    query = f"Flights from {origin} to {destination} on {depart.isoformat()}"
    return f"https://www.google.com/travel/flights?hl=pt-BR&curr=BRL&q={quote_plus(query)}"


def booking_url_for(
    settings,
    *,
    carrier: str,
    origin: str,
    destination: str,
    depart: date,
    cabin: str = "economy",
    adults: int = 1,
) -> str:
    """Melhor link de reserva disponível para a companhia (nunca vazio).

    Prioridade: template do Settings (Copa/LATAM, configurável por .env) →
    template do registro → busca no Google Flights (fallback universal).
    """
    template = ""
    if carrier == "CM":
        template = getattr(settings, "copa_booking_url", "")
    elif carrier == "LA":
        template = getattr(settings, "latam_offers_url", "")
    if not template:
        info = AIRLINE_REGISTRY.get(carrier)
        template = info.booking_template if info else ""
    if template:
        try:
            return template.format(
                origin=origin,
                destination=destination,
                date=depart.isoformat(),
                adults=adults,
                cabin=cabin,
            )
        except (KeyError, IndexError, ValueError):
            pass  # template malformado não pode derrubar a resposta
    return google_flights_url(origin, destination, depart)
