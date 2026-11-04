import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from celestia_travel.models import CabinClass, FlightOffer, FlightQuery


def test_query_normalizes_iata_codes():
    query = FlightQuery(origin="gru", destination=" mia ", depart_date=date(2026, 8, 10))
    assert query.origin == "GRU"
    assert query.destination == "MIA"
    assert query.route == "GRU-MIA"


def test_query_rejects_invalid_iata():
    with pytest.raises(ValueError):
        FlightQuery(origin="SAOPAULO", destination="MIA", depart_date=date(2026, 8, 10))


def test_query_rejects_same_origin_destination():
    with pytest.raises(ValueError):
        FlightQuery(origin="GRU", destination="GRU", depart_date=date(2026, 8, 10))


def test_query_rejects_return_before_depart():
    with pytest.raises(ValueError):
        FlightQuery(
            origin="GRU",
            destination="MIA",
            depart_date=date(2026, 8, 10),
            return_date=date(2026, 8, 1),
        )


def test_query_rejects_out_of_range_flex():
    with pytest.raises(ValueError):
        FlightQuery(
            origin="GRU", destination="MIA", depart_date=date(2026, 8, 10), flex_days=30
        )


def test_offer_total_and_dedup_key():
    offer = FlightOffer(
        provider="demo",
        airline="LATAM",
        flight_number="LA1234",
        origin="GRU",
        destination="MIA",
        depart_date=date(2026, 8, 10),
        depart_time="08:30",
        duration_minutes=480,
        stops=0,
        price_cash=2500.0,
        taxes=180.55,
    )
    assert offer.total_cash == 2680.55
    assert offer.dedup_key() == ("LATAM", "LA1234", "2026-08-10", "08:30")
