"""FlexDateScoutAgent — corta datas caras antes do scraping.

Quando o usuário marca "tenho flexibilidade nas datas", em vez de raspar
±N dias fixos (gastando tokens em datas caras), este agente lê o **calendário
de preços do Google Flights** numa janela ampla (uma única sessão Interact) e
devolve as `flex_max_dates` datas mais baratas — que são as únicas levadas ao
scraping caro. Se o calendário não estiver disponível (sem Firecrawl, erro),
degrada para a janela ±N dias tradicional.
"""

from __future__ import annotations

from datetime import timedelta

from ..models import DatePrice, SearchRequest
from ..providers import firecrawl_interact
from ..providers.base import ProviderError
from .base import Agent


class FlexDateScoutAgent(Agent):
    name = "flex-scout"

    async def cheapest_dates(self, request: SearchRequest) -> list:
        """Datas candidatas dentro da janela de flexibilidade, mais baratas primeiro.

        Retorna sempre pelo menos [depart]. Não lança — degrada para a janela
        simétrica quando o calendário não pôde ser lido.
        """
        flex = request.flexibility
        if not flex or not flex.enabled:
            return [request.depart]

        start, end = flex.resolve_window(request.depart)

        if self.ctx.settings.mock_mode:
            prices = _mock_calendar(request.origin, request.destination, start, end)
        else:
            try:
                prices = await firecrawl_interact.scan_calendar(
                    self.ctx.settings,
                    origin=request.origin,
                    destination=request.destination,
                    cabin=request.cabin_target,
                    start=start,
                    end=end,
                )
            except ProviderError as error:
                self.log(f"calendário indisponível ({error}) — usando janela simétrica")
                return _window_fallback(request, start, end)

        if not prices:
            self.log("calendário vazio — usando janela simétrica")
            return _window_fallback(request, start, end)

        in_window = [p for p in prices if start <= p.date <= end]
        in_window.sort(key=lambda p: p.price_brl)
        chosen = [p.date for p in in_window[: max(1, request.flex_max_dates)]]
        cheapest = in_window[0]
        self.log(
            f"calendário: {len(in_window)} datas lidas; escolhidas {len(chosen)} "
            f"mais baratas (menor: {cheapest.date} R$ {cheapest.price_brl:.0f})"
        )
        return chosen


def _window_fallback(request: SearchRequest, start, end) -> list:
    """Amostra a janela em passos, limitada a flex_max_dates (evita explodir)."""
    total_days = (end - start).days
    if total_days <= 0:
        return [request.depart]
    n = max(1, request.flex_max_dates)
    step = max(1, total_days // n)
    dates = []
    day = start
    while day <= end and len(dates) < n:
        dates.append(day)
        day = day + timedelta(days=step)
    return dates or [request.depart]


def _mock_calendar(origin: str, destination: str, start, end) -> list[DatePrice]:
    """Calendário determinístico para demos/testes: preço varia com o dia."""
    import hashlib

    from ..models import Source

    prices: list[DatePrice] = []
    day = start
    while day <= end:
        seed = int(
            hashlib.sha256(f"{origin}{destination}{day.isoformat()}".encode()).hexdigest()[:6],
            16,
        )
        base = 1500 + seed % 3500
        # fins de semana mais caros (padrão realista)
        weekend = 1.25 if day.weekday() >= 5 else 1.0
        prices.append(
            DatePrice(date=day, price_brl=round(base * weekend, 2), source=Source.MOCK)
        )
        day = day + timedelta(days=1)
    return prices
