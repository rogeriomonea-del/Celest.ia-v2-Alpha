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


def build(zip_paths: list[Path], tickers: set[str] | None = None) -> Path:
    """Extrai séries de preços para parquet silver.

    `tickers=None` = universo COMPLETO da B3 (mercado a vista, tp_merc=010):
    ações, units, FIIs, ETFs e BDRs. Leilões/termo/opções ficam fora.
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


# Classificação HEURÍSTICA de tipo de ativo (documentada; nunca apresentada
# como cadastro oficial): BDI 12 = FII; sufixos 34/35/32/33 = BDR; final 11
# fora de BDI 12 = unit (se emissor FCA) ou ETF/fundo provável; demais = ação.
_BDR_SUFFIX = ("31", "32", "33", "34", "35", "39")


def classify_ticker(ticker: str, cd_bdi: int | None, fca_tickers: set[str]) -> tuple[str, str]:
    t = ticker.strip().upper()
    if cd_bdi == 12:
        return "fii", "ALTA"
    if any(t.endswith(sfx) for sfx in _BDR_SUFFIX) and len(t) >= 6:
        return "bdr", "MEDIA"
    if t.endswith("11") or t.endswith("11B"):
        if t in fca_tickers:
            return "unit", "ALTA"
        return "etf_ou_fundo", "BAIXA"
    if t in fca_tickers:
        return "acao_br", "ALTA"
    return "acao_br", "MEDIA"


def build_asset_registry(listings: pd.DataFrame) -> Path:
    """Registro de TODOS os ativos negociados (última data por ticker) com
    classificação heurística e vínculo ao emissor quando existir (FCA)."""
    prices = load()
    last = prices.sort_values("trade_date").groupby("ticker").tail(1)
    fca = set(listings["ticker"].unique())
    by_ticker_cnpj = dict(zip(listings["ticker"], listings["cnpj"]))
    rows = []
    for _, r in last.iterrows():
        tipo, conf = classify_ticker(str(r["ticker"]), int(r["cd_bdi"]) if str(r["cd_bdi"]).isdigit() else None, fca)
        rows.append({
            "ticker": r["ticker"], "tipo": tipo, "classificacao_confianca": conf,
            "cnpj_emissor": by_ticker_cnpj.get(r["ticker"]),
            "ultimo_pregao": r["trade_date"], "ultimo_fechamento": r["close"],
            "cd_bdi": r["cd_bdi"], "especificacao": r["especificacao"],
            "fonte": "b3_cotahist + cvm_fca (classificação heurística documentada)",
        })
    reg = pd.DataFrame(rows).sort_values("ticker")
    out = config.SILVER_DIR / "asset_registry.parquet"
    reg.to_parquet(out, index=False)
    return out


def load() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "market_prices.parquet")


def load_asset_registry() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "asset_registry.parquet")
