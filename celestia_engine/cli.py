"""CLI do celest.ia engine.

Exemplos:
    python -m celestia_engine search GRU PTY --depart 2026-09-10 --miles-balance 120000
    python -m celestia_engine search GRU LIS --depart 2026-09-10 --flex 2 --program latampass
    python -m celestia_engine routes
    python -m celestia_engine milheiro
    CELESTIA_MOCK=1 python -m celestia_engine search GRU LIS --depart 2026-09-10   # demo offline
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from datetime import date

from .agents.orchestrator import Orchestrator
from .config import load_settings
from .models import Cabin, SearchReport, SearchRequest
from .routes import RouteCatalog


def _fmt_brl(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _print_report(report: SearchReport, verbose: bool = False) -> None:
    request = report.request
    print(f"\n=== celest.ia · {request.origin} → {request.destination} · {request.depart} ===")
    stats = report.stats
    print(
        f"candidatos: {stats.candidates_total} | raspados: {stats.candidates_scraped} | "
        f"economizados pelo pré-filtro: {stats.scrapes_saved_by_prefilter} | "
        f"subagentes: {stats.subagents_spawned} | {stats.duration_seconds}s"
    )

    failures = [
        line
        for line in report.agent_log
        if "falhou" in line or "indisponível" in line or "nenhuma" in line
    ]
    if verbose:
        print("\n--- Log completo dos agentes ---")
        for line in report.agent_log:
            print(f"  {line}")
    elif failures and (not report.offers or not report.quotes):
        print("\n--- Diagnóstico (falhas dos agentes) ---")
        for line in failures[:12]:
            print(f"  {line}")
        print("  → dica: rode `python -m celestia_engine status` e confira se você")
        print("    clicou em Subscribe em cada API no RapidAPI (erro 403 = sem subscribe).")

    if report.quotes:
        print("\n--- Pré-filtro (indicativo) ---")
        for quote in report.quotes[:6]:
            print(
                f"  {quote.route!s:28} {quote.depart} {quote.cabin.value:8} "
                f"{_fmt_brl(quote.price_brl):>14}  [{quote.source.value}]"
            )

    if report.offers:
        print("\n--- Ofertas raspadas ---")
        for offer in report.offers[:10]:
            cash = _fmt_brl(offer.price_cash_brl) if offer.price_cash_brl else "—"
            miles = f"{offer.price_miles:,} mi".replace(",", ".") if offer.price_miles else "—"
            print(
                f"  {offer.carrier} {'/'.join(offer.flight_numbers):12} "
                f"{offer.origin}→{offer.destination} {offer.cabin.value:8} "
                f"cash {cash:>14} | award {miles:>12} [{offer.source.value}]"
            )

    if report.options:
        print("\n--- Estratégias de compra (ranqueadas por custo efetivo) ---")
        for index, option in enumerate(report.options[:8], 1):
            miles = f"{option.miles:,}".replace(",", ".") if option.miles else "0"
            breakeven = (
                f" | breakeven milheiro {_fmt_brl(option.breakeven_milheiro_brl)}"
                if option.breakeven_milheiro_brl
                else ""
            )
            print(
                f"  {index}. {option.label:38} cabine {option.cabin_final.value:8} "
                f"cash {_fmt_brl(option.cash_brl):>14} + {miles:>9} milhas "
                f"→ efetivo {_fmt_brl(option.effective_total_brl):>14}{breakeven}"
            )
            for note in option.notes:
                print(f"       · {note}")

    best = report.best_option()
    if best:
        print(f"\n>>> Melhor estratégia: {best.label} — efetivo {_fmt_brl(best.effective_total_brl)}")
    print()


def _report_to_json(report: SearchReport) -> str:
    def default(obj):
        if isinstance(obj, date):
            return obj.isoformat()
        if hasattr(obj, "value"):
            return obj.value
        return str(obj)

    return json.dumps(asdict(report), default=default, ensure_ascii=False, indent=2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="celestia_engine")
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="pesquisa completa multi-agente")
    search.add_argument("origin")
    search.add_argument("destination")
    search.add_argument("--depart", required=True, help="YYYY-MM-DD")
    search.add_argument("--return", dest="return_date", default=None, help="YYYY-MM-DD")
    search.add_argument("--cabin", default="business", choices=[c.value for c in Cabin])
    search.add_argument("--flex", type=int, default=0, help="± dias de flexibilidade")
    search.add_argument(
        "--flex-weeks",
        type=int,
        choices=[1, 2, 3, 4],
        help="flexibilidade ampla (lê o calendário): 1/2/3 semanas ou 4=1 mês",
    )
    search.add_argument(
        "--flex-window",
        nargs=2,
        metavar=("INICIO", "FIM"),
        help="período flexível personalizado YYYY-MM-DD YYYY-MM-DD",
    )
    search.add_argument(
        "--flex-max-dates", type=int, default=5, help="quantas datas baratas raspar"
    )
    search.add_argument("--miles-balance", type=int, default=0)
    search.add_argument("--program", default="connectmiles")
    search.add_argument("--json", action="store_true", help="saída em JSON")
    search.add_argument(
        "--verbose", action="store_true", help="imprime o log completo dos agentes"
    )

    sub.add_parser("status", help="quais integrações estão ativas nesta máquina")
    sub.add_parser(
        "strategies", help="desempenho aprendido de cada estratégia de scraping"
    )
    sub.add_parser(
        "doctor", help="testa cada integração com 1 chamada real e mostra o resultado"
    )
    sub.add_parser("routes", help="resumo da malha de rotas")
    sub.add_parser("milheiro", help="tabela de milheiro configurada")

    mesh = sub.add_parser("mesh", help="atualiza a malha viva via Lyov (RPL/DECEA)")
    mesh.add_argument(
        "--companies",
        default="TAM,GLO,AZU",
        help="códigos ICAO separados por vírgula (padrão: TAM,GLO,AZU)",
    )

    args = parser.parse_args(argv)

    if args.command == "status":
        settings = load_settings()
        checks = [
            ("SerpApi (Google Flights premium)", bool(settings.serpapi_key)),
            ("google-flights2 via RapidAPI (pré-filtro)", settings.has_google_flights2()),
            (
                f"Skyscanner via {settings.rapidapi_sky_host}"
                if settings.rapidapi_key and not settings.skyscanner_api_key
                else "Skyscanner Partners (oficial)",
                settings.has_skyscanner(),
            ),
            ("Firecrawl (scraping gerenciado Copa/LATAM)", settings.has_firecrawl()),
            ("Lyov (malha RPL/DECEA)", settings.has_lyov()),
            ("Histórico CSV p/ ML", settings.history_enabled),
            ("Modo mock (demo offline)", settings.mock_mode),
        ]
        print("Integrações do celest.ia nesta máquina:\n")
        for name, active in checks:
            print(f"  [{'✓' if active else '✗'}] {name}")
        print(f"\n  Histórico: {settings.history_dir}/searches.csv")
        print(f"  Malha viva: {settings.mesh_csv}")
        if not any(active for _, active in checks[:3]):
            print("\n  ⚠ Nenhuma fonte de pré-filtro ativa — a busca raspará tudo (caro).")
        print(
            "\n  Lembrete RapidAPI: além da chave, é preciso clicar em Subscribe\n"
            "  (plano free) em CADA API no site do RapidAPI."
        )
        return 0

    if args.command == "doctor":
        from datetime import timedelta

        from .models import Route
        from .providers import google_flights, google_flights2, lyov, skyscanner
        from .providers.base import ProviderNotConfigured, post_json

        settings = load_settings()
        route = Route("GRU", "MIA", "*")
        depart = date.today() + timedelta(days=30)

        async def _doctor():
            results: list[tuple[str, str, str]] = []

            async def check(name, fn):
                try:
                    detail = await fn()
                    results.append((name, "✓", detail))
                except ProviderNotConfigured as error:
                    results.append((name, "—", f"não configurado ({error})"))
                except Exception as error:  # noqa: BLE001 - doctor reporta tudo
                    results.append((name, "✗", str(error)[:220]))

            def fmt_quotes(quotes):
                if not quotes:
                    return "OK — respondeu, sem preços para a rota de teste"
                cheapest = min(q.price_brl for q in quotes)
                return f"OK — {len(quotes)} preços (menor: R$ {cheapest:,.0f})".replace(",", ".")

            async def check_serpapi():
                return fmt_quotes(
                    await google_flights.quote(settings, route, depart, Cabin.ECONOMY)
                )

            async def check_gf2():
                return fmt_quotes(
                    await google_flights2.quote(settings, route, depart, Cabin.ECONOMY)
                )

            async def check_sky():
                return fmt_quotes(
                    await skyscanner.quote(settings, route, depart, Cabin.ECONOMY)
                )

            async def check_lyov():
                plans = await lyov.fetch_plans(settings, company="TAM", cycle=date.today())
                return f"OK — {len(plans)} planos RPL da TAM"

            async def check_firecrawl():
                if not settings.has_firecrawl():
                    raise ProviderNotConfigured("FIRECRAWL_API_KEY ausente")
                payload = await post_json(
                    settings.firecrawl_api_url,
                    json_body={"url": "https://example.com", "formats": ["markdown"]},
                    headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"},
                    timeout_s=30,
                    retries=1,
                )
                if payload.get("success"):
                    return "OK — scrape de teste respondeu"
                return f"respondeu com erro: {payload.get('error', 'desconhecido')}"

            import asyncio as aio

            await aio.gather(
                check("SerpApi (google_flights)", check_serpapi),
                check("google-flights2 (RapidAPI)", check_gf2),
                check(f"Skyscanner ({settings.rapidapi_sky_host})", check_sky),
                check("Lyov malha RPL (RapidAPI)", check_lyov),
                check("Firecrawl (consome ~1 crédito)", check_firecrawl),
            )
            return results

        def _fingerprint(key: str) -> str:
            if not key:
                return "<vazia>"
            if len(key) <= 10:
                return f"{key[:2]}…{key[-2:]} ({len(key)} caracteres)"
            return f"{key[:6]}…{key[-4:]} ({len(key)} caracteres)"

        print("Chaves em uso (compare com o painel do provedor):")
        print(f"  RAPIDAPI_KEY      = {_fingerprint(settings.rapidapi_key)}")
        print(f"  FIRECRAWL_API_KEY = {_fingerprint(settings.firecrawl_api_key)}")
        print(f"  SERPAPI_KEY       = {_fingerprint(settings.serpapi_key)}")
        print("\nTestando cada integração com 1 chamada REAL (rota de teste GRU→MIA)…\n")
        ok = True
        for name, mark, detail in asyncio.run(_doctor()):
            print(f"  [{mark}] {name}\n      {detail}")
            if mark == "✗":
                ok = False
        print(
            "\nLegenda: ✓ funcionando · — sem chave (fonte desativada) · ✗ erro"
            "\nDica: 403 no RapidAPI = falta clicar Subscribe naquela API específica."
        )
        return 0 if ok else 1

    if args.command == "strategies":
        from .storage import performance_summary

        settings = load_settings()
        summary = performance_summary(settings)
        print(f"Estratégias base: {settings.scrape_strategies}")
        print(f"Histórico: {settings.strategy_csv}\n")
        if not summary:
            print("Sem histórico ainda — rode algumas buscas para o sistema aprender.")
            return 0
        print("Score por site (maior = tentada primeiro):")
        for site, scores in summary.items():
            print(f"  {site}:")
            for strategy, score in sorted(scores.items(), key=lambda kv: -kv[1]):
                print(f"    {score:.2f}  {strategy}")
        return 0

    if args.command == "routes":
        summary = RouteCatalog.coverage_summary()
        print("Malha de rotas carregada:")
        for name, count in summary.items():
            print(f"  {name:12} {count:4} rotas")
        print(f"  {'total':12} {sum(summary.values()):4} rotas")
        return 0

    if args.command == "milheiro":
        settings = load_settings()
        print("Milheiro configurado (R$ por 1.000 milhas):")
        for program, value in sorted(settings.milheiro_brl.items()):
            print(f"  {program:14} R$ {value:6.2f}")
        return 0

    if args.command == "mesh":
        from .agents.base import AgentContext
        from .agents.mesh import RouteMeshAgent

        settings = load_settings()
        agent = RouteMeshAgent(AgentContext(settings=settings))
        companies = tuple(c.strip().upper() for c in args.companies.split(",") if c.strip())
        routes = asyncio.run(agent.refresh(companies))
        if routes:
            print(f"Malha viva atualizada: {len(routes)} rotas → {settings.mesh_csv}")
        else:
            print(
                "⚠ Nenhuma rota obtida — a malha NÃO foi atualizada. "
                "Verifique RAPIDAPI_KEY/Subscribe da API Lyov (log abaixo)."
            )
        for line in agent.ctx.log_lines:
            print(f"  {line}")
        return 0 if routes else 1

    flexibility = None
    if args.flex_window:
        from .models import Flexibility

        flexibility = Flexibility(
            enabled=True,
            preset="custom",
            window_start=date.fromisoformat(args.flex_window[0]),
            window_end=date.fromisoformat(args.flex_window[1]),
        )
    elif args.flex_weeks:
        from .models import Flexibility

        preset = {1: "1w", 2: "2w", 3: "3w", 4: "1m"}[args.flex_weeks]
        flexibility = Flexibility(enabled=True, preset=preset)

    request = SearchRequest(
        origin=args.origin.upper(),
        destination=args.destination.upper(),
        depart=date.fromisoformat(args.depart),
        return_date=date.fromisoformat(args.return_date) if args.return_date else None,
        cabin_target=Cabin(args.cabin),
        flex_days=max(0, args.flex),
        flexibility=flexibility,
        flex_max_dates=max(1, args.flex_max_dates),
        miles_balance=args.miles_balance,
        program=args.program.lower(),
    )
    orchestrator = Orchestrator.from_env()
    orchestrator.ctx.settings.verbose = args.verbose
    if not orchestrator.ctx.settings.mock_mode:
        print(
            "⏳ Pesquisa real em andamento — pré-filtro + scraping podem levar "
            "alguns minutos. Use --verbose para acompanhar ao vivo.",
            flush=True,
        )
    report = asyncio.run(orchestrator.search(request))
    if args.json:
        print(_report_to_json(report))
    else:
        _print_report(report, verbose=args.verbose)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
