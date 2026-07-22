from datetime import date

from celestia_engine.models import Cabin, Route, Source
from celestia_engine.providers.airline_scraper import parse_airline_payload

ROUTE = Route("GRU", "PTY", "CM", direct=True)

COPA_STYLE_PAYLOAD = {
    "data": {
        "flightSearch": {
            "itineraries": [
                {
                    "flights": [{"flightNumber": "CM 702"}],
                    "price": {"totalPrice": 4321.50, "taxes": 310.20},
                    "miles": 65000,
                },
                {
                    "flights": [{"flightNumber": "702"}, {"flightNumber": "CM 480"}],
                    "price": {"totalPrice": 3980.00, "taxes": 298.00},
                },
            ]
        }
    }
}

LATAM_STYLE_PAYLOAD = {
    "content": [
        {
            "itinerary": {"legs": [{"number": "LA 8084"}]},
            "amount": 5100.75,
            "taxAmount": 402.10,
            "points": 78000,
        }
    ]
}


def test_parse_copa_style_payload():
    offers = parse_airline_payload(
        COPA_STYLE_PAYLOAD,
        carrier="CM",
        program="connectmiles",
        route=ROUTE,
        depart=date(2026, 9, 10),
        cabin=Cabin.ECONOMY,
        source=Source.COPA,
    )
    assert len(offers) == 2
    first, second = offers
    assert first.price_cash_brl == 4321.50
    assert first.taxes_brl == 310.20
    assert first.price_miles == 65000
    assert first.miles_program == "connectmiles"
    assert first.flight_numbers == ("CM 702",)
    # bare numbers get the carrier prefix; order preserved, deduped
    assert second.flight_numbers == ("CM 702", "CM 480")
    assert second.price_miles is None


def test_parse_latam_style_payload():
    route = Route("GRU", "LIS", "LA", direct=True)
    offers = parse_airline_payload(
        LATAM_STYLE_PAYLOAD,
        carrier="LA",
        program="latampass",
        route=route,
        depart=date(2026, 9, 10),
        cabin=Cabin.BUSINESS,
        source=Source.LATAM,
    )
    assert len(offers) == 1
    offer = offers[0]
    assert offer.price_cash_brl == 5100.75
    assert offer.taxes_brl == 402.10
    assert offer.price_miles == 78000
    assert offer.flight_numbers == ("LA 8084",)
    assert offer.cabin is Cabin.BUSINESS


def test_parse_garbage_payload_yields_nothing():
    offers = parse_airline_payload(
        {"foo": [1, 2, {"bar": "baz"}]},
        carrier="CM",
        program="connectmiles",
        route=ROUTE,
        depart=date(2026, 9, 10),
        cabin=Cabin.ECONOMY,
        source=Source.COPA,
    )
    assert offers == []
