import asyncio
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from celestia_travel.agents.auditor import AuditorAgent
from celestia_travel.agents.base import AgentContext
from celestia_travel.agents.valuation import MilesValuationAgent, implied_cpm
from celestia_travel.config import Settings
from celestia_travel.models import (
    CabinClass,
    FlightOffer,
    FlightQuery,
    MilesBalance,
    SearchTask,
)
from celestia_travel.providers.mock_provider import MockProvider


def _query():
    return FlightQuery(origin="GRU", destination="MIA", depart_date=date(2026, 8, 10))


def _ctx(offers):
    ctx = AgentContext(query=_query(), settings=Settings())
    ctx.offers = offers
    return ctx


def _offer(price, flight="LA1000", time="08:00", miles=None, program=None, stops=0):
    return FlightOffer(
        provider="demo",
        airline="LATAM",
        flight_number=flight,
        origin="GRU",
        destination="MIA",
        depart_date=date(2026, 8, 10),
        depart_time=time,
        duration_minutes=480,
        stops=stops,
        price_cash=price,
        taxes=100.0,
        miles_price=miles,
        miles_program=program,
    )


def test_mock_provider_is_deterministic():
    provider = MockProvider()
    task = SearchTask(
        provider_name="demo",
        origin="GRU",
        destination="MIA",
        depart_date=date(2026, 8, 10),
        cabin=CabinClass.ECONOMY,
        passengers=1,
    )
    first = asyncio.run(provider.search(task))
    second = asyncio.run(provider.search(task))
    assert first and len(first) == len(second)
    assert [o.dedup_key() for o in first] == [o.dedup_key() for o in second]
    assert [o.total_cash for o in first] == [o.total_cash for o in second]


def test_auditor_dedups_and_keeps_cheapest():
    offers = [
        _offer(2000.0, flight="LA1000", time="08:00"),
        _offer(1800.0, flight="LA1000", time="08:00"),  # duplicata mais barata
        _offer(2200.0, flight="LA2000", time="10:00"),
    ]
    ctx = _ctx(offers)
    asyncio.run(AuditorAgent().run(ctx))
    keys = {o.dedup_key(): o for o in ctx.offers}
    assert len(ctx.offers) == 2
    assert keys[("LATAM", "LA1000", "2026-08-10", "08:00")].total_cash == 1900.0


def test_auditor_drops_high_outliers_and_flags_low():
    base = [_offer(2000.0, flight=f"LA{i:04d}", time=f"{6 + i:02d}:00") for i in range(4)]
    base.append(_offer(20000.0, flight="LA9999", time="23:00"))  # outlier alto
    base.append(_offer(400.0, flight="LA0001", time="05:00"))  # suspeita baixa
    ctx = _ctx(base)
    auditor = AuditorAgent()
    asyncio.run(auditor.run(ctx))
    prices = [o.total_cash for o in ctx.offers]
    assert 20100.0 not in prices  # outlier removido
    assert auditor.flagged  # tarifa baixa sinalizada


def test_implied_cpm_none_without_miles():
    assert implied_cpm(_offer(2000.0)) is None


def test_valuation_recommends_miles_when_cpm_above_reference():
    # 100.000 milhas por R$ 3.000 → milheiro R$ 30/1.000, acima da referência 20.
    offer = _offer(2900.0, miles=100_000, program="Smiles")
    ctx = _ctx([offer])
    ctx.settings = Settings(milheiro_reference=20.0)
    asyncio.run(MilesValuationAgent().run(ctx))
    top = ctx.evaluations[0]
    assert top.use_miles is True
    assert top.cpm is not None and top.cpm >= 20.0


def test_valuation_flags_insufficient_balance():
    offer = _offer(2900.0, miles=100_000, program="Smiles")
    ctx = _ctx([offer])
    ctx.settings = Settings(milheiro_reference=20.0)
    ctx.balances = [MilesBalance(program="Smiles", miles=50_000, updated_at=datetime.now())]
    asyncio.run(MilesValuationAgent().run(ctx))
    top = ctx.evaluations[0]
    assert top.miles_sufficient is False
    assert any("insuficiente" in flag for flag in top.flags)


def test_valuation_prefers_direct_flight_at_equal_price():
    offers = [
        _offer(1500.0, flight="LA1000", time="08:00", stops=0),
        _offer(1500.0, flight="G31000", time="09:00", stops=2),
    ]
    ctx = _ctx(offers)
    asyncio.run(MilesValuationAgent().run(ctx))
    # Preços iguais: o voo direto vence pela penalidade de paradas.
    assert ctx.evaluations[0].offer.stops == 0
