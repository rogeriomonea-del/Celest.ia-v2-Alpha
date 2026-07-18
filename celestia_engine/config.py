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


def load_dotenv(path: Path | None = None) -> None:
    """Minimal .env loader (KEY=VALUE lines, # comments). No dependency."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    env_path = path or Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


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

    # --- Airline scraping (Playwright; no key, URL templates overridable) ---
    copa_booking_url: str = (
        "https://shopping.copaair.com/flights/{origin}-{destination}"
        "?date={date}&adults={adults}&cabin={cabin}"
    )
    latam_offers_url: str = (
        "https://www.latamairlines.com/br/pt/oferta-voos"
        "?origin={origin}&destination={destination}&outbound={date}&adt={adults}&cabin={cabin}"
    )
    scraper_headless: bool = True
    scraper_timeout_ms: int = 45_000

    # --- Orchestrator knobs ---
    prefilter_top_k: int = 4       # candidates that survive the price pre-filter
    max_subagents: int = 6         # concurrent scraper subagents
    http_timeout_s: float = 20.0
    mock_mode: bool = False        # force deterministic mock providers

    # --- Miles economics ---
    milheiro_brl: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_MILHEIRO_BRL))

    def milheiro_for(self, program: str) -> float:
        return self.milheiro_brl.get(program.lower(), 30.0)

    def has_google_flights(self) -> bool:
        return bool(self.serpapi_key)

    def has_skyscanner(self) -> bool:
        return bool(self.skyscanner_api_key or self.rapidapi_key)

    def has_firecrawl(self) -> bool:
        return bool(self.firecrawl_api_key)


def load_settings() -> Settings:
    load_dotenv()
    settings = Settings(
        serpapi_key=_env("SERPAPI_KEY"),
        skyscanner_api_key=_env("SKYSCANNER_API_KEY"),
        rapidapi_key=_env("RAPIDAPI_KEY"),
        firecrawl_api_key=_env("FIRECRAWL_API_KEY"),
        firecrawl_api_url=_env("FIRECRAWL_API_URL", Settings.firecrawl_api_url),
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
