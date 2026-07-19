"""Runtime configuration.

Every credential and tuning knob is read from environment variables (a local
``.env`` file at the repository root is loaded first, without overriding real
environment variables). See ``.env.example`` for the full catalogue.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

_ENV_LOADED = False


#: Caracteres invisíveis que sobrevivem a copy-paste e quebram chaves de API.
_INVISIBLE = "﻿​‌‍⁠ "
_SMART_QUOTES = "“”‘’"


def parse_env_line(line: str) -> tuple[str, str] | None:
    """Parse one .env line into (key, value), or None for comments/blank.

    Robusto contra os acidentes reais de copy-paste: BOM, zero-width, aspas
    curvas, espaços e comentários inline (`KEY=valor  # nota`).
    """
    for ch in _INVISIBLE:
        line = line.replace(ch, "")
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None
    key, _, value = line.partition("=")
    key = key.strip()
    value = value.strip()
    # comentário inline: corta no primeiro ' #' fora de aspas
    if not (value.startswith('"') or value.startswith("'")):
        value = value.split(" #", 1)[0].split("\t#", 1)[0].rstrip()
    value = value.strip().strip('"').strip("'")
    for ch in _SMART_QUOTES:
        value = value.replace(ch, "")
    return key, value.strip()


def load_dotenv(path: Path | None = None) -> None:
    """Minimal .env loader (KEY=VALUE lines, # comments). No dependency."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    env_path = path or Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        parsed = parse_env_line(line)
        if parsed:
            os.environ.setdefault(parsed[0], parsed[1])


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


#: Default market value of 1000 miles (o "milheiro"), in BRL, per program.
#: Calibrate with the price you actually pay when buying/transferring miles
#: (Livelo/Esfera promos etc.) via the MILHEIRO_* env vars.
DEFAULT_MILHEIRO_BRL: dict[str, float] = {
    "connectmiles": 34.0,  # Copa Airlines ConnectMiles
    "latampass": 29.0,     # LATAM Pass
    "smiles": 22.0,        # GOL Smiles (reference)
    "azul": 24.0,          # Azul Fidelidade (reference)
}


@dataclass
class Settings:
    # --- API keys (pre-filter providers) ---
    serpapi_key: str = ""          # SERPAPI_KEY — Google Flights via SerpApi
    skyscanner_api_key: str = ""   # SKYSCANNER_API_KEY — Skyscanner Partners v3
    rapidapi_key: str = ""         # RAPIDAPI_KEY — fallback Skyscanner via RapidAPI

    # --- Managed scraping (Firecrawl) ---
    firecrawl_api_key: str = ""    # FIRECRAWL_API_KEY — scraping gerenciado
    firecrawl_api_url: str = "https://api.firecrawl.dev/v1/scrape"
    firecrawl_api_base: str = "https://api.firecrawl.dev"  # base do modo Interact (v2)
    firecrawl_interact_enabled: bool = True  # tenta o fluxo Interact (sessão viva)
    # Páginas iniciais onde o Interact preenche o formulário de busca:
    copa_interact_url: str = "https://www.copaair.com/pt-br/"
    latam_interact_url: str = "https://www.latamairlines.com/br/pt"
    usd_brl_rate: float = 5.40     # conversão quando o site cota em USD (USD_BRL_RATE)
    # Estratégias de scraping habilitadas e ordem-base; o desempenho real
    # (data/strategy_performance.csv) reordena isto a cada busca.
    scrape_strategies: str = "firecrawl_interact,firecrawl_scrape,playwright_local"
    strategy_csv: str = "data/strategy_performance.csv"

    # --- RapidAPI hosts (todas usam a mesma RAPIDAPI_KEY) ---
    # Skyscanner: troque para "flights-sky.p.rapidapi.com" sem tocar em código.
    rapidapi_sky_host: str = "sky-scrapper.p.rapidapi.com"
    rapidapi_sky_endpoint: str = "/api/v1/flights/searchFlights"
    # Google Flights via RapidAPI (google-flights2, DataCrawler)
    gf2_host: str = "google-flights2.p.rapidapi.com"
    gf2_endpoint: str = "/api/v1/searchFlights"
    # Desligue fontes RapidAPI individuais sem remover a chave:
    gf2_enabled: bool = True           # GF2_ENABLED=0 desativa google-flights2
    rapidapi_sky_enabled: bool = True  # RAPIDAPI_SKY_ENABLED=0 desativa o Skyscanner via RapidAPI
    # Lyov — planos de voo RPL/DECEA das companhias brasileiras
    lyov_host: str = "brazilian-airlines-real-flights-data.p.rapidapi.com"
    lyov_path: str = "/api/flights"

    # --- Histórico de pesquisas (CSV que alimenta o ML) ---
    history_enabled: bool = True
    history_dir: str = "data"
    mesh_csv: str = "data/routes_live.csv"

    # --- Airline scraping (Playwright; no key, URL templates overridable) ---
    # Formato real capturado do site (parâmetros area1/area2/date1 na raiz):
    copa_booking_url: str = (
        "https://shopping.copaair.com/?roundtrip=false&adults={adults}"
        "&children=0&infants=0&sf=br&langid=pt&date1={date}&promocode="
        "&area1={origin}&area2={destination}"
        "&advanced_air_search=false&flexible_dates_v2=false"
    )
    latam_offers_url: str = (
        "https://www.latamairlines.com/br/pt/ofertas-voos"
        "?origin={origin}&outbound={date}T00%3A00%3A00.000Z"
        "&destination={destination}&inbound=null&adt={adults}&chd=0&inf=0"
        "&trip=OW&cabin={cabin}&redemption=false&sort=RECOMMENDED"
    )
    scraper_headless: bool = True
    scraper_timeout_ms: int = 45_000

    # --- Orchestrator knobs ---
    prefilter_top_k: int = 4       # candidates that survive the price pre-filter
    max_subagents: int = 6         # concurrent scraper subagents
    http_timeout_s: float = 20.0
    mock_mode: bool = False        # force deterministic mock providers
    verbose: bool = False          # stream agent log to stderr in real time

    # --- Miles economics ---
    milheiro_brl: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_MILHEIRO_BRL))

    def milheiro_for(self, program: str) -> float:
        return self.milheiro_brl.get(program.lower(), 30.0)

    def has_google_flights(self) -> bool:
        return bool(self.serpapi_key)

    def has_skyscanner(self) -> bool:
        return bool(
            self.skyscanner_api_key or (self.rapidapi_key and self.rapidapi_sky_enabled)
        )

    def has_firecrawl(self) -> bool:
        return bool(self.firecrawl_api_key)

    def has_google_flights2(self) -> bool:
        return bool(self.rapidapi_key and self.gf2_enabled)

    def has_lyov(self) -> bool:
        return bool(self.rapidapi_key)


_REPO_ROOT = Path(__file__).resolve().parent.parent


def _rooted(path_str: str) -> str:
    """Anchor relative data paths at the repo root, not the caller's CWD."""
    path = Path(path_str)
    return str(path if path.is_absolute() else _REPO_ROOT / path)


def load_settings() -> Settings:
    load_dotenv()
    settings = Settings(
        serpapi_key=_env("SERPAPI_KEY"),
        skyscanner_api_key=_env("SKYSCANNER_API_KEY"),
        rapidapi_key=_env("RAPIDAPI_KEY"),
        firecrawl_api_key=_env("FIRECRAWL_API_KEY"),
        firecrawl_api_url=_env("FIRECRAWL_API_URL", Settings.firecrawl_api_url),
        rapidapi_sky_host=_env("RAPIDAPI_SKY_HOST", Settings.rapidapi_sky_host),
        rapidapi_sky_endpoint=_env("RAPIDAPI_SKY_ENDPOINT", Settings.rapidapi_sky_endpoint),
        gf2_host=_env("GF2_HOST", Settings.gf2_host),
        gf2_endpoint=_env("GF2_ENDPOINT", Settings.gf2_endpoint),
        lyov_host=_env("LYOV_HOST", Settings.lyov_host),
        lyov_path=_env("LYOV_PATH", Settings.lyov_path),
        gf2_enabled=_env("GF2_ENABLED", "1") not in {"0", "false", "no"},
        rapidapi_sky_enabled=_env("RAPIDAPI_SKY_ENABLED", "1") not in {"0", "false", "no"},
        history_enabled=_env("HISTORY_ENABLED", "1") not in {"0", "false", "no"},
        history_dir=_rooted(_env("HISTORY_DIR", Settings.history_dir)),
        mesh_csv=_rooted(_env("MESH_CSV", Settings.mesh_csv)),
        strategy_csv=_rooted(_env("STRATEGY_CSV", Settings.strategy_csv)),
        firecrawl_api_base=_env("FIRECRAWL_API_BASE", Settings.firecrawl_api_base),
        firecrawl_interact_enabled=_env("FIRECRAWL_INTERACT", "1") not in {"0", "false", "no"},
        copa_interact_url=_env("COPA_INTERACT_URL", Settings.copa_interact_url),
        latam_interact_url=_env("LATAM_INTERACT_URL", Settings.latam_interact_url),
        usd_brl_rate=_env_float("USD_BRL_RATE", Settings.usd_brl_rate),
        scrape_strategies=_env("SCRAPE_STRATEGIES", Settings.scrape_strategies),
        copa_booking_url=_env("COPA_BOOKING_URL", Settings.copa_booking_url),
        latam_offers_url=_env("LATAM_OFFERS_URL", Settings.latam_offers_url),
        scraper_headless=_env("SCRAPER_HEADLESS", "1") not in {"0", "false", "no"},
        scraper_timeout_ms=_env_int("SCRAPER_TIMEOUT_MS", 45_000),
        prefilter_top_k=_env_int("PREFILTER_TOP_K", 4),
        max_subagents=_env_int("MAX_SUBAGENTS", 6),
        http_timeout_s=_env_float("HTTP_TIMEOUT_S", 20.0),
        mock_mode=_env("CELESTIA_MOCK", "") in {"1", "true", "yes"},
    )
    for program in list(settings.milheiro_brl):
        override = _env_float(f"MILHEIRO_{program.upper()}", settings.milheiro_brl[program])
        settings.milheiro_brl[program] = override
    return settings
