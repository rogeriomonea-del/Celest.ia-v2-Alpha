from datetime import date

from celestia_engine.airlines import (
    AIRLINE_REGISTRY,
    booking_url_for,
    google_flights_url,
    resolve_carrier_label,
)
from celestia_engine.config import Settings
from celestia_engine.models import Cabin, FlightOffer, Source
from celestia_engine.storage import (
    demote_failing_strategies,
    failure_streaks,
    known_carrier_codes,
    load_discovered,
    record_carriers,
    record_route_outcome,
)

DEPART = date(2026, 9, 20)


def _offer(carrier="XX", label="Xanadu Air"):
    return FlightOffer(
        carrier=carrier, flight_numbers=(f"{carrier} 123",), origin="GRU",
        destination="MCO", depart=DEPART, cabin=Cabin.ECONOMY,
        price_cash_brl=1000.0, source=Source.GOOGLE_FLIGHTS,
        raw={"airline_label": label},
    )


# ------------------------------------------------------------------- registry
def test_registry_is_extensive_and_resolves_labels():
    assert len(AIRLINE_REGISTRY) >= 25
    assert resolve_carrier_label("Copa Airlines") == "CM"
    assert resolve_carrier_label("Azul Linhas Aéreas") == "AD"
    assert resolve_carrier_label("Qatar Airways") == "QR"
    assert resolve_carrier_label("la") == "LA"          # código IATA direto
    assert resolve_carrier_label("Cia Desconhecida") == "*"


def test_booking_url_priority_settings_registry_google():
    settings = Settings()
    # CM/LA usam os templates do Settings
    copa = booking_url_for(settings, carrier="CM", origin="GRU",
                           destination="MCO", depart=DEPART)
    assert "copaair.com" in copa and "GRU" in copa and "2026-09-20" in copa
    # G3 usa o template do registro
    gol = booking_url_for(settings, carrier="G3", origin="GRU",
                          destination="GIG", depart=DEPART)
    assert "voegol.com.br" in gol
    # companhia sem template → busca no Google Flights (nunca vazio)
    unknown = booking_url_for(settings, carrier="ZZ", origin="GRU",
                              destination="MCO", depart=DEPART)
    assert unknown == google_flights_url("GRU", "MCO", DEPART)
    assert unknown.startswith("https://www.google.com/travel/flights")


# --------------------------------------------------- discovered airlines (ML)
def test_record_carriers_learns_new_and_ignores_known(tmp_path):
    settings = Settings(strategy_csv=str(tmp_path / "strategy.csv"))
    new = record_carriers(settings, [_offer("XX"), _offer("LA"), _offer("XX")])
    assert new == ["XX"]                       # LA é curada; XX só uma vez
    assert "XX" in known_carrier_codes(settings)
    # segunda busca com a mesma companhia: nada novo
    assert record_carriers(settings, [_offer("XX")]) == []
    row = load_discovered(settings)["XX"]
    assert row["label"] == "Xanadu Air"
    assert row["sample_route"] == "GRU-MCO"


# ------------------------------------------------------- failure memory (ML)
def test_failure_streaks_demote_and_reset_on_success(tmp_path):
    settings = Settings(strategy_csv=str(tmp_path / "strategy.csv"))
    order = ["firecrawl_interact", "firecrawl_scrape", "playwright_local"]

    for _ in range(3):
        record_route_outcome(settings, site="copa", strategy="firecrawl_interact",
                             route="GRU-MCO", depart="2026-09-20",
                             success=False, error="timeout")
    assert failure_streaks(settings, "copa", "GRU-MCO")["firecrawl_interact"] == 3
    # 3 falhas seguidas nesta rota → vai para o FIM (mas não é removida)
    demoted = demote_failing_strategies(settings, "copa", "GRU-MCO", order)
    assert demoted == ["firecrawl_scrape", "playwright_local", "firecrawl_interact"]
    # outra rota não é afetada
    assert demote_failing_strategies(settings, "copa", "GRU-MIA", order) == order

    # um sucesso zera a sequência e restaura a ordem
    record_route_outcome(settings, site="copa", strategy="firecrawl_interact",
                         route="GRU-MCO", depart="2026-09-21", success=True)
    assert demote_failing_strategies(settings, "copa", "GRU-MCO", order) == order


def test_failure_memory_never_breaks_on_corrupt_csv(tmp_path):
    settings = Settings(strategy_csv=str(tmp_path / "strategy.csv"))
    failures = tmp_path / "search_failures.csv"
    failures.write_text("garbage\x00,,,\nnot,a,csv")
    order = ["a", "b"]
    assert demote_failing_strategies(settings, "copa", "GRU-MCO", order) == order
