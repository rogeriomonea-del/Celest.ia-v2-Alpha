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
