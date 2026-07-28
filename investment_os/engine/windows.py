"""Análise de janelas de taxa sobre uma série histórica de um ÚNICO título.

Nunca misturar vencimentos: o chamador passa a série já filtrada por
(tipo_titulo, dt_vencimento). Inclui hysteresis opcional para alertas.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date


@dataclass(frozen=True)
class Window:
    start: date
    end: date
    sessions: int


@dataclass
class WindowAnalysis:
    threshold: float
    total_sessions: int
    sessions_at_or_above: int
    fraction: float
    windows: list[Window]
    longest_window: Window | None
    last_occurrence: date | None
    threshold_percentile: float
    max_rate: float
    min_rate: float
    mean_rate: float
    median_rate: float
    first_date: date
    last_date: date

    def to_dict(self) -> dict:
        d = asdict(self)
        d["windows"] = [asdict(w) for w in self.windows]
        return d


def analyze(series: list[tuple[date, float]], threshold: float) -> WindowAnalysis:
    """`series`: [(data_base, taxa)] de um único título, sem NaN.

    Janela contínua = sequência de pregões consecutivos NA SÉRIE com taxa >=
    limite (dias sem pregão não quebram a janela).
    """
    if not series:
        raise ValueError("série vazia")
    srt = sorted(series, key=lambda x: x[0])
    dates = [d for d, _ in srt]
    rates = [r for _, r in srt]
    n = len(rates)

    above = [r >= threshold for r in rates]
    windows: list[Window] = []
    start_idx: int | None = None
    for i, flag in enumerate(above):
        if flag and start_idx is None:
            start_idx = i
        elif not flag and start_idx is not None:
            windows.append(Window(dates[start_idx], dates[i - 1], i - start_idx))
            start_idx = None
    if start_idx is not None:
        windows.append(Window(dates[start_idx], dates[-1], n - start_idx))

    count_above = sum(above)
    sorted_rates = sorted(rates)
    below = sum(1 for r in sorted_rates if r < threshold)
    percentile = below / n * 100.0

    return WindowAnalysis(
        threshold=threshold,
        total_sessions=n,
        sessions_at_or_above=count_above,
        fraction=count_above / n,
        windows=windows,
        longest_window=max(windows, key=lambda w: w.sessions) if windows else None,
        last_occurrence=max((w.end for w in windows), default=None),
        threshold_percentile=percentile,
        max_rate=max(rates),
        min_rate=min(rates),
        mean_rate=sum(rates) / n,
        median_rate=sorted_rates[n // 2] if n % 2 else (sorted_rates[n // 2 - 1] + sorted_rates[n // 2]) / 2,
        first_date=dates[0],
        last_date=dates[-1],
    )


def hysteresis_signal(
    series: list[tuple[date, float]], enter_at: float, exit_at: float
) -> list[tuple[date, bool]]:
    """Sinal com hysteresis: liga quando taxa >= enter_at, só desliga quando
    taxa < exit_at (exit_at < enter_at). Evita alertas oscilando diariamente."""
    if exit_at >= enter_at:
        raise ValueError("exit_at deve ser menor que enter_at")
    out: list[tuple[date, bool]] = []
    active = False
    for d, r in sorted(series, key=lambda x: x[0]):
        if not active and r >= enter_at:
            active = True
        elif active and r < exit_at:
            active = False
        out.append((d, active))
    return out
