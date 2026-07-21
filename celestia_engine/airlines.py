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

import re
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
        ("OB", "Boliviana de Aviación", "", ""),
        ("2Z", "Voepass Linhas Aéreas", "", ""),
        ("P5", "Wingo", "", ""),
        ("FO", "Flybondi", "", ""),
        ("DM", "Arajet", "", ""),
        # --- América do Norte ---
        ("AA", "American Airlines", "aadvantage", ""),
        ("UA", "United Airlines", "mileageplus", ""),
        ("DL", "Delta Air Lines", "skymiles", ""),
        ("AC", "Air Canada", "aeroplan", ""),
        ("AM", "Aeroméxico", "", ""),
        ("B6", "JetBlue", "trueblue", ""),
        ("AS", "Alaska Airlines", "mileage_plan", ""),
        ("WN", "Southwest Airlines", "rapid_rewards", ""),
        ("WS", "WestJet", "", ""),
        ("F9", "Frontier Airlines", "", ""),
        ("NK", "Spirit Airlines", "", ""),
        ("Y4", "Volaris", "", ""),
        ("VB", "VivaAerobus", "", ""),
        # --- Europa ---
        ("TP", "TAP Air Portugal", "milesandgo", ""),
        ("IB", "Iberia", "iberia_plus", ""),
        ("UX", "Air Europa", "", ""),
        ("AF", "Air France", "flyingblue", ""),
        ("KL", "KLM", "flyingblue", ""),
        ("LH", "Lufthansa", "milesandmore", ""),
        ("LX", "SWISS", "milesandmore", ""),
        ("OS", "Austrian Airlines", "milesandmore", ""),
        ("SN", "Brussels Airlines", "milesandmore", ""),
        ("BA", "British Airways", "avios", ""),
        ("AZ", "ITA Airways", "", ""),
        ("LO", "LOT Polish Airlines", "milesandmore", ""),
        ("EI", "Aer Lingus", "", ""),
        ("FI", "Icelandair", "", ""),
        ("VY", "Vueling", "", ""),
        ("FR", "Ryanair", "", ""),
        ("U2", "easyJet", "", ""),
        ("W6", "Wizz Air", "", ""),
        # --- Oriente Médio / África ---
        ("EK", "Emirates", "skywards", ""),
        ("QR", "Qatar Airways", "privilege_club", ""),
        ("EY", "Etihad Airways", "etihad_guest", ""),
        ("TK", "Turkish Airlines", "milessmiles", ""),
        ("SV", "Saudia", "alfursan", ""),
        ("MS", "EgyptAir", "", ""),
        ("RJ", "Royal Jordanian", "", ""),
        ("AT", "Royal Air Maroc", "safar_flyer", ""),
        ("ET", "Ethiopian Airlines", "", ""),
        ("KQ", "Kenya Airways", "", ""),
        ("SA", "South African Airways", "", ""),
        ("DT", "TAAG Angola Airlines", "", ""),
        ("LY", "EL AL", "matmid", ""),
        # --- Ásia / Pacífico ---
        ("SQ", "Singapore Airlines", "krisflyer", ""),
        ("NH", "ANA — All Nippon Airways", "mileage_club", ""),
        ("JL", "Japan Airlines", "mileage_bank", ""),
        ("KE", "Korean Air", "skypass", ""),
        ("OZ", "Asiana Airlines", "asiana_club", ""),
        ("CX", "Cathay Pacific", "asia_miles", ""),
        ("CA", "Air China", "phoenixmiles", ""),
        ("MU", "China Eastern", "", ""),
        ("CZ", "China Southern", "", ""),
        ("TG", "Thai Airways", "royal_orchid_plus", ""),
        ("QF", "Qantas", "qantas_ff", ""),
        ("NZ", "Air New Zealand", "airpoints", ""),
    ]
}

#: Rótulos curtos que precisam de igualdade EXATA (substring seria ambíguo:
#: "ana" está dentro de "Boliviana", "jal" dentro de "Jalisco"…).
_EXACT_LABELS: dict[str, str] = {
    "ana": "NH",
    "jal": "JL",
    "boa": "OB",
    "lot": "LO",
    "tam": "LA",
}

#: Rótulos livres (como o metasearch escreve) → código IATA.
_LABEL_TO_CODE: dict[str, str] = {
    "latam": "LA", "tam ": "LA",
    "gol": "G3", "smiles": "G3",
    "azul": "AD",
    "copa": "CM",
    "avianca": "AV",
    "aerolineas": "AR", "aerolíneas": "AR",
    "sky airline": "H2", "sky ": "H2",
    "jetsmart": "JA",
    "boliviana": "OB",
    "voepass": "2Z", "passaredo": "2Z",
    "wingo": "P5",
    "flybondi": "FO",
    "arajet": "DM",
    "american": "AA",
    "united": "UA",
    "delta": "DL",
    "air canada": "AC",
    "aeromexico": "AM", "aeroméxico": "AM",
    "jetblue": "B6",
    "alaska": "AS",
    "southwest": "WN",
    "westjet": "WS",
    "frontier": "F9",
    "spirit": "NK",
    "volaris": "Y4",
    "vivaaerobus": "VB", "viva aerobus": "VB",
    "tap": "TP",
    "iberia": "IB",
    "air europa": "UX",
    "air france": "AF",
    "klm": "KL",
    "lufthansa": "LH",
    "swiss": "LX",
    "austrian": "OS",
    "brussels": "SN",
    "british": "BA",
    "ita airways": "AZ", "alitalia": "AZ",
    "lot polish": "LO",
    "aer lingus": "EI",
    "icelandair": "FI",
    "vueling": "VY",
    "ryanair": "FR",
    "easyjet": "U2",
    "wizz": "W6",
    "emirates": "EK",
    "qatar": "QR",
    "etihad": "EY",
    "turkish": "TK",
    "saudi": "SV",
    "egyptair": "MS",
    "royal jordanian": "RJ",
    "royal air maroc": "AT",
    "ethiopian": "ET",
    "kenya": "KQ",
    "south african": "SA",
    "taag": "DT", "angola": "DT",
    "el al": "LY",
    "singapore": "SQ",
    "all nippon": "NH",
    "japan airlines": "JL",
    "korean": "KE",
    "asiana": "OZ",
    "cathay": "CX",
    "air china": "CA",
    "china eastern": "MU",
    "china southern": "CZ",
    "thai airways": "TG",
    "qantas": "QF",
    "air new zealand": "NZ",
}


def resolve_carrier_label(label: str, default: str = "*") -> str:
    """"Copa Airlines" → CM. Aceita o próprio código IATA. Sem match → default."""
    text = (label or "").strip()
    # códigos IATA são alfanuméricos com ao menos uma letra (G3, 2Z, U2…)
    if len(text) == 2 and text.isalnum() and not text.isdigit():
        return text.upper()
    low = text.lower()
    exact = _EXACT_LABELS.get(low)
    if exact:
        return exact
    for needle, code in _LABEL_TO_CODE.items():
        # fronteira à esquerda: "gol" casa em "GOL Linhas" mas não em "Angola"
        if re.search(rf"(?<![a-z0-9]){re.escape(needle)}", low):
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
    elif carrier == "G3":
        template = getattr(settings, "gol_booking_url", "")
    elif carrier == "AD":
        template = getattr(settings, "azul_booking_url", "")
    if not template:
        info = AIRLINE_REGISTRY.get(carrier)
        template = info.booking_template if info else ""
    if template:
        try:
            return template.format(
                origin=origin,
                destination=destination,
                date=depart.isoformat(),
                # formatos alternativos para sites que não aceitam ISO no
                # deep-link — use {date_dmy}/{date_mdy} no template do .env
                date_dmy=depart.strftime("%d-%m-%Y"),
                date_mdy=depart.strftime("%m/%d/%Y"),
                adults=adults,
                cabin=cabin,
            )
        except (KeyError, IndexError, ValueError):
            pass  # template malformado não pode derrubar a resposta
    return google_flights_url(origin, destination, depart)
