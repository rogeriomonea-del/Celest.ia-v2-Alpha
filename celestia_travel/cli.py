"""CLI da plataforma: ``python -m celestia_travel.cli buscar GRU MIA 2026-08-10``."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from celestia_travel.agents.advisor import format_brl, format_int
from celestia_travel.agents.base import AgentEvent
from celestia_travel.config import Settings
from celestia_travel.miles.connectmiles import ConnectMilesClient, MilesError
from celestia_travel.models import CabinClass, FlightQuery, MilesBalance, ResearchReport
from celestia_travel.orchestrator import Orchestrator
from celestia_travel.providers import (
    CopaProvider,
    FlightProvider,
    MockProvider,
    SkyscannerProvider,
)

_LEVEL_BADGES = {
    "info": "·",
    "ok": "✔",
    "warn": "⚠",
    "error": "✖",
}


def _print_event(event: AgentEvent) -> None:
    badge = _LEVEL_BADGES.get(event.level, "·")
    timestamp = event.timestamp.strftime("%H:%M:%S")
    print(f"{timestamp} {badge} [{event.agent:<11}] {event.message}")


def _parse_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Data inválida: {raw!r} (use o formato AAAA-MM-DD)."
        ) from error


def _build_providers(settings: Settings, live: bool) -> list[FlightProvider]:
    providers: list[FlightProvider] = [MockProvider()]
    if live:
        providers.append(SkyscannerProvider(settings.skyscanner_api_key))
        providers.append(CopaProvider(settings.copa_api_url))
    return providers


def _load_balances(settings: Settings) -> list[MilesBalance]:
    if settings.connectmiles_user and settings.connectmiles_password:
        client = ConnectMilesClient(
            settings.connectmiles_user, settings.connectmiles_password
        )
        try:
            return [client.fetch_balance()]
        except MilesError as error:
            print(f"⚠ ConnectMiles indisponível ({error}); usando saldo demo.")
    return [ConnectMilesClient.mock()]


def _print_report(report: ResearchReport) -> None:
    print()
    print("═" * 78)
    print(
        f" RELATÓRIO celest.ia · {report.query.route} · "
        f"ida {report.query.depart_date.strftime('%d/%m/%Y')} "
        f"(±{report.query.flex_days}d) · {report.query.passengers} pax"
    )
    print("═" * 78)
    print(
        f" Provedores: {', '.join(report.providers_queried) or '—'}"
        + (
            f" · indisponíveis: {', '.join(report.providers_failed)}"
            if report.providers_failed
            else ""
        )
    )
    print(
        f" Ofertas: {report.offers_found} coletadas → {report.offers_valid} aprovadas"
    )
    print("─" * 78)

    if not report.evaluations:
        print(" Nenhuma oferta aprovada.")
    else:
        header = (
            f" {'#':<2} {'Companhia':<18} {'Voo':<8} {'Data':<10} "
            f"{'Par.':<4} {'Preço (R$)':>12} {'Milhas':>10} {'Score':>6}"
        )
        print(header)
        print("─" * 78)
        for index, evaluation in enumerate(report.evaluations, start=1):
            offer = evaluation.offer
            miles_text = (
                format_int(offer.miles_price) if offer.miles_price else "—"
            )
            marker = "★" if evaluation.use_miles else " "
            print(
                f" {index:<2} {offer.airline[:17]:<18} {offer.flight_number:<8} "
                f"{offer.depart_date.strftime('%d/%m/%y'):<10} {offer.stops:<4} "
                f"{format_brl(offer.total_cash):>12} {miles_text:>9}{marker} "
                f"{evaluation.score:>6.2f}"
            )
        print("─" * 78)
        print(" ★ = emissão com milhas vantajosa frente à sua referência de milheiro")

    print()
    print(f" Análise ({report.narrative_source}):")
    for line in report.narrative.splitlines():
        print(f"   {line}")
    if report.warnings:
        print()
        print(" Avisos:")
        for warning in report.warnings:
            print(f"   ⚠ {warning}")
    print("═" * 78)


def _command_buscar(args: argparse.Namespace) -> int:
    settings = Settings.from_env()
    if args.milheiro is not None:
        settings = Settings(
            milheiro_reference=args.milheiro,
            skyscanner_api_key=settings.skyscanner_api_key,
            copa_api_url=settings.copa_api_url,
            connectmiles_user=settings.connectmiles_user,
            connectmiles_password=settings.connectmiles_password,
            llm_model=settings.llm_model,
            llm_max_tokens=settings.llm_max_tokens,
            use_llm=settings.use_llm,
        )

    try:
        query = FlightQuery(
            origin=args.origem,
            destination=args.destino,
            depart_date=args.data,
            return_date=args.volta,
            flex_days=args.flex,
            cabin=CabinClass(args.cabine),
            passengers=args.passageiros,
        )
    except ValueError as error:
        print(f"✖ {error}")
        return 2

    providers = _build_providers(settings, live=args.live)
    balances = _load_balances(settings)
    orchestrator = Orchestrator(providers, settings, listener=_print_event)

    print(f"celest.ia travel · pesquisa multi-agente · {datetime.now():%d/%m/%Y %H:%M}")
    print("─" * 78)
    report = orchestrator.run_sync(query, balances)
    _print_report(report)

    if args.json:
        path = Path(args.json)
        path.write_text(
            json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\nRelatório JSON salvo em {path}")

    return 0 if report.evaluations else 1


def _command_saldo(_: argparse.Namespace) -> int:
    settings = Settings.from_env()
    if settings.connectmiles_user and settings.connectmiles_password:
        client = ConnectMilesClient(
            settings.connectmiles_user, settings.connectmiles_password
        )
        try:
            balance = client.fetch_balance()
        except MilesError as error:
            print(f"✖ Falha ao consultar o ConnectMiles: {error}")
            return 1
    else:
        print(
            "Sem credenciais (CONNECTMILES_USER/CONNECTMILES_PASSWORD) — saldo demo."
        )
        balance = ConnectMilesClient.mock()

    print(
        f"{balance.program}: {format_int(balance.miles)} milhas "
        f"(consultado em {balance.updated_at:%d/%m/%Y %H:%M})"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="celestia-travel",
        description="Pesquisa multi-agente de passagens aéreas e milhas.",
    )
    subparsers = parser.add_subparsers(dest="comando", required=True)

    buscar = subparsers.add_parser(
        "buscar", help="Pesquisa ofertas para uma rota e data."
    )
    buscar.add_argument("origem", help="Aeroporto de origem (IATA, ex.: GRU)")
    buscar.add_argument("destino", help="Aeroporto de destino (IATA, ex.: MIA)")
    buscar.add_argument("data", type=_parse_date, help="Data de ida (AAAA-MM-DD)")
    buscar.add_argument(
        "--volta", type=_parse_date, default=None, help="Data de volta (opcional)"
    )
    buscar.add_argument(
        "--flex",
        type=int,
        default=0,
        help="Flexibilidade em dias para a ida (0 a 7, padrão 0)",
    )
    buscar.add_argument(
        "--cabine",
        choices=[cabin.value for cabin in CabinClass],
        default=CabinClass.ECONOMY.value,
        help="Classe de cabine (padrão: economica)",
    )
    buscar.add_argument(
        "--passageiros", type=int, default=1, help="Número de passageiros (padrão 1)"
    )
    buscar.add_argument(
        "--milheiro",
        type=float,
        default=None,
        help="Sua referência de valor do milheiro em R$ (padrão 20.0)",
    )
    buscar.add_argument(
        "--live",
        action="store_true",
        help="Inclui provedores reais configurados via env (Skyscanner/Copa)",
    )
    buscar.add_argument(
        "--json", default=None, help="Salva o relatório em JSON no caminho indicado"
    )
    buscar.set_defaults(func=_command_buscar)

    saldo = subparsers.add_parser(
        "saldo", help="Consulta o saldo de milhas (ConnectMiles)."
    )
    saldo.set_defaults(func=_command_saldo)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
