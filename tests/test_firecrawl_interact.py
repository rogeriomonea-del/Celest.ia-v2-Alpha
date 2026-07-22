from datetime import date

from celestia_engine.models import Cabin, Route, Source
from celestia_engine.providers.firecrawl_interact import parse_interact_output

ROUTE = Route("GRU", "MCO", "CM", direct=False, via="PTY")
DEPART = date(2026, 11, 28)


def _parse(text):
    return parse_interact_output(
        text,
        carrier="CM",
        program="connectmiles",
        route=ROUTE,
        depart=DEPART,
        source=Source.COPA,
        usd_brl_rate=5.0,
    )


def test_parse_json_with_usd_conversion_and_multi_airline():
    text = (
        "Aqui estão as tarifas:\n```json\n"
        '{"offers":['
        '{"airline":"COPA","flight_numbers":["CM 702"],"cabin":"economy",'
        '"price":1226,"currency":"USD","departure_time":"01:40","duration_minutes":680,"stops":1},'
        '{"airline":"Avianca","flight_numbers":["AV 85"],"cabin":"business",'
        '"price":1958,"currency":"USD","departure_time":"02:40","duration_minutes":735,"stops":1}'
        "]}\n```\n"
    )
    offers = _parse(text)
    assert len(offers) == 2

    copa, avianca = offers
    assert copa.price_cash_brl == 6130.0          # 1226 * 5.0
    assert copa.cabin is Cabin.ECONOMY
    assert copa.carrier == "CM"
    assert copa.raw["via"] == "firecrawl_interact"
    assert copa.raw["currency"] == "USD"
    assert copa.raw["duration_min"] == 680

    # rótulo "Avianca" mapeado para código IATA AV, cabine business
    assert avianca.carrier == "AV"
    assert avianca.cabin is Cabin.BUSINESS
    assert avianca.price_cash_brl == 9790.0


def test_parse_brl_is_not_converted():
    text = '{"offers":[{"airline":"COPA","cabin":"economy","price":3500,"currency":"BRL"}]}'
    offers = _parse(text)
    assert offers[0].price_cash_brl == 3500.0


def test_parse_plain_json_without_fence():
    text = 'lixo antes {"offers":[{"airline":"COPA","cabin":"business","price":1000,"currency":"BRL"}]} lixo depois'
    offers = _parse(text)
    assert len(offers) == 1 and offers[0].price_cash_brl == 1000.0


def test_parse_garbage_or_no_offers_returns_empty():
    assert _parse("desculpe, não consegui extrair nada") == []
    assert _parse('{"resultado":"vazio"}') == []
    assert _parse('{"offers":[{"airline":"COPA","price":"n/a"}]}') == []


def test_flight_numbers_as_string_is_not_exploded():
    # o LLM devolveu flight_numbers como string em vez de array
    text = '{"offers":[{"airline":"COPA","flight_numbers":"CM 702","cabin":"economy","price":1000,"currency":"BRL"}]}'
    offers = _parse(text)
    assert offers[0].flight_numbers == ("CM 702",)  # não ("C","M","7","0","2")


def test_open_session_handles_null_metadata():
    import asyncio

    import httpx

    from celestia_engine.config import Settings
    from celestia_engine.providers import firecrawl_interact
    from celestia_engine.providers.base import ProviderError

    async def run(monkeypatched_payload):
        async def fake_post_json(url, **kw):
            return monkeypatched_payload

        firecrawl_interact.post_json = fake_post_json  # type: ignore
        return await firecrawl_interact.open_session(
            Settings(firecrawl_api_key="fc"), "https://x"
        )

    real_post = firecrawl_interact.post_json
    try:
        # metadata explicitamente null não deve virar AttributeError
        import pytest

        with pytest.raises(ProviderError):
            asyncio.run(run({"data": {"metadata": None}}))
    finally:
        firecrawl_interact.post_json = real_post


# ----------------------------------------------------- parsing tolerante (v17)
def test_money_number_handles_all_llm_formats():
    from celestia_engine.providers.firecrawl_interact import money_number

    assert money_number(1226) == 1226.0
    assert money_number("1226.5") == 1226.5
    assert money_number("R$ 1.226,00") == 1226.0
    assert money_number("US$1,226.00") == 1226.0
    assert money_number("1.226") == 1226.0       # milhar BR, não R$ 1,23
    assert money_number("1,226") == 1226.0       # milhar US
    assert money_number("1226,50") == 1226.5     # decimal BR
    assert money_number("abc") is None
    assert money_number(None) is None


def test_positive_int_handles_grouped_miles():
    from celestia_engine.providers.firecrawl_interact import _to_positive_int

    assert _to_positive_int("60.000") == 60000
    assert _to_positive_int("60,000") == 60000
    assert _to_positive_int(60000) == 60000
    assert _to_positive_int("nada") is None
    assert _to_positive_int(-5) is None


def test_clean_url_rejects_placeholder_and_extracts_real():
    from celestia_engine.providers.firecrawl_interact import _clean_url

    assert _clean_url("https://...") is None
    assert _clean_url("veja https://www.copaair.com/x?a=1 aqui") == (
        "https://www.copaair.com/x?a=1"
    )
    assert _clean_url("https://site.com/checkout.") == "https://site.com/checkout"
    assert _clean_url("texto solto") is None


def test_cabin_of_understands_premium_economy_ptbr():
    from celestia_engine.models import Cabin
    from celestia_engine.providers.firecrawl_interact import _cabin_of

    assert _cabin_of("Econômica premium") == Cabin.PREMIUM
    assert _cabin_of("Executiva") == Cabin.BUSINESS
    assert _cabin_of("economy") == Cabin.ECONOMY


def test_resolve_carrier_accepts_alphanumeric_iata():
    from celestia_engine.providers.firecrawl_interact import _resolve_carrier

    assert _resolve_carrier("GOL", "G3", "*") == "G3"
    assert _resolve_carrier("Voepass", "2Z", "*") == "2Z"
    assert _resolve_carrier("x", "12", "*") == "*"   # dois dígitos não é IATA


def test_calendar_parses_formatted_prices():
    from celestia_engine.providers.firecrawl_interact import parse_calendar_output

    out = parse_calendar_output(
        '{"calendar":[{"date":"2026-09-20","price":"R$ 1.562","currency":"BRL"}]}',
        usd_brl_rate=5.0,
    )
    assert len(out) == 1 and out[0].price_brl == 1562.0


def test_truncated_json_salvages_complete_offers():
    # saída cortada pelo limite de tokens: o objeto externo nunca fecha,
    # mas as ofertas completas internas são recuperadas
    from celestia_engine.models import Route
    from celestia_engine.providers.firecrawl_interact import parse_interact_output

    text = (
        '{"offers":[{"airline":"COPA","airline_iata":"CM","flight_numbers":["CM 702"],'
        '"cabin":"economy","price":1226,"currency":"USD"},'
        '{"airline":"COPA","airline_iata":"CM","flight_numbers":["CM 480"],'
        '"cabin":"business","price":3400,"currency":"USD"},'
        '{"airline":"COPA","flight_numbers":["CM 9'
    )
    offers = parse_interact_output(
        text, carrier="CM", program="connectmiles",
        route=Route("GRU", "PTY", "CM"), depart=DEPART,
        source=Source.COPA, usd_brl_rate=5.0,
    )
    assert len(offers) == 2
    assert {o.flight_numbers[0] for o in offers} == {"CM 702", "CM 480"}


def test_truncated_calendar_salvages_complete_dates():
    from celestia_engine.providers.firecrawl_interact import parse_calendar_output

    text = ('{"calendar":[{"date":"2026-09-20","price":1562},'
            '{"date":"2026-09-21","price":1710},{"date":"2026-09-2')
    out = parse_calendar_output(text, usd_brl_rate=5.0)
    assert [str(p.date) for p in out] == ["2026-09-20", "2026-09-21"]
