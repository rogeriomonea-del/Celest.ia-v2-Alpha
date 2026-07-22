from celestia_engine.routes import RouteCatalog
from celestia_engine.routes import copa, latam, skyscanner


def test_copa_is_pty_hub():
    routes = copa.all_routes()
    assert len(routes) == 2 * len(copa.PTY_DESTINATIONS)
    assert all("PTY" in (r.origin, r.destination) for r in routes)
    assert all(r.carrier == "CM" for r in routes)


def test_copa_via_pty_connection():
    options = copa.routes_between("GRU", "MIA")
    assert len(options) == 1
    route = options[0]
    assert route.via == "PTY" and route.direct is False

    nonstop = copa.routes_between("GRU", "PTY")
    assert nonstop and nonstop[0].direct is True


def test_copa_unserved_pair_is_empty():
    assert copa.routes_between("GRU", "LIS") == []
    assert copa.routes_between("GRU", "GRU") == []


def test_latam_nonstop_and_via_hub():
    direct = latam.routes_between("GRU", "LIS")
    assert direct and direct[0].direct is True and direct[0].carrier == "LA"

    via_hub = latam.routes_between("GIG", "MAD")
    assert via_hub and via_hub[0].direct is False and via_hub[0].via == "GRU"


def test_iata_codes_are_well_formed():
    for route in RouteCatalog.all_routes():
        assert len(route.origin) == 3 and route.origin.isupper()
        assert len(route.destination) == 3 and route.destination.isupper()
        assert route.origin != route.destination


def test_catalog_candidates_include_metasearch_catchall():
    candidates = RouteCatalog.candidates("GRU", "LIS")
    carriers = {r.carrier for r in candidates}
    assert "LA" in carriers   # nonstop LATAM
    assert "*" in carriers    # skyscanner catch-all
    assert "CM" not in carriers  # Copa doesn't fly to Europe


def test_skyscanner_popular_routes_loaded():
    assert len(skyscanner.all_routes()) == 2 * len(skyscanner.POPULAR_PAIRS)


def test_coverage_summary_counts():
    summary = RouteCatalog.coverage_summary()
    assert summary["copa"] > 100
    assert summary["latam"] > 80
    assert summary["skyscanner"] > 50
