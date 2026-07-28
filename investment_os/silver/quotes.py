"""Silver das cotações B3: parse do layout posicional COTAHIST → parquet.

Layout oficial (registro tipo 01, 245 bytes). Preços com 2 casas implícitas
(V99). ATENÇÃO: preços NÃO ajustados por proventos (adjusted=false).
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pandas as pd

from .. import config

# (nome, início, fim) em posições 1-based inclusivas do layout oficial.
_FIELDS = [
    ("tipreg", 1, 2),
    ("trade_date", 3, 10),
    ("cd_bdi", 11, 12),
    ("ticker", 13, 24),
    ("tp_merc", 25, 27),
    ("especificacao", 40, 49),
    ("moeda", 53, 56),
    ("open", 57, 69),
    ("high", 70, 82),
    ("low", 83, 95),
    ("close", 109, 121),
    ("trades", 148, 152),
    ("qty", 153, 170),
    ("volume_fin", 171, 188),
    ("fator_cotacao", 211, 217),
]
_PRICE_COLS = ("open", "high", "low", "close")


def parse_cotahist(zip_path: Path, tickers: set[str] | None = None) -> pd.DataFrame:
    rows: list[dict] = []
    with zipfile.ZipFile(zip_path) as z:
        name = z.namelist()[0]
        with z.open(name) as raw, io.TextIOWrapper(raw, encoding="latin-1") as f:
            for line in f:
                if not line.startswith("01"):
                    continue
                tkr = line[12:24].strip()
                if tickers is not None and tkr not in tickers:
                    continue
                rec: dict = {}
                for fname, start, end in _FIELDS:
                    rec[fname] = line[start - 1 : end].strip()
                rows.append(rec)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d").dt.date
    for col in _PRICE_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce") / 100.0
    for col in ("trades", "qty", "volume_fin", "fator_cotacao", "tp_merc"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["volume_fin"] = df["volume_fin"] / 100.0
    df["adjusted"] = False
    df["source_id"] = "b3_cotahist"
    return df.drop(columns=["tipreg"])


def build(zip_paths: list[Path], tickers: set[str]) -> Path:
    """Extrai as séries dos tickers de interesse para parquet silver.

    Mercado a vista (tp_merc=010) e BDI padrão/fundos para evitar leilões e
    mercados a termo.
    """
    frames = [parse_cotahist(p, tickers) for p in zip_paths]
    df = pd.concat([f for f in frames if not f.empty], ignore_index=True)
    df = df[df["tp_merc"] == 10]
    df = df.drop_duplicates(subset=["ticker", "trade_date"]).sort_values(
        ["ticker", "trade_date"]
    )
    out = config.SILVER_DIR / "market_prices.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    return out


def load() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "market_prices.parquet")
