"""Silver do Tesouro Direto: tipagem, datas ISO, decimal ponto, dedup."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from .. import config

COLUMNS = {
    "Tipo Titulo": "tipo_titulo",
    "Data Vencimento": "dt_vencimento",
    "Data Base": "data_base",
    "Taxa Compra Manha": "taxa_compra_manha",
    "Taxa Venda Manha": "taxa_venda_manha",
    "PU Compra Manha": "pu_compra_manha",
    "PU Venda Manha": "pu_venda_manha",
    "PU Base Manha": "pu_base_manha",
}


def build(bronze_csv: Path) -> Path:
    df = pd.read_csv(bronze_csv, sep=";", encoding="latin-1", decimal=",")
    missing = set(COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Colunas ausentes no CSV do Tesouro: {missing}")
    df = df.rename(columns=COLUMNS)
    for col in ("dt_vencimento", "data_base"):
        df[col] = pd.to_datetime(df[col], format="%d/%m/%Y").dt.date
    for col in df.columns:
        if col.startswith(("taxa_", "pu_")):
            df[col] = pd.to_numeric(df[col], errors="coerce")

    before = len(df)
    df = df.drop_duplicates(subset=["tipo_titulo", "dt_vencimento", "data_base"])
    df = df.sort_values(["tipo_titulo", "dt_vencimento", "data_base"]).reset_index(drop=True)
    df["dedup_removed"] = before - len(df)
    df["source_id"] = "tesouro_transparente"

    out = config.SILVER_DIR / "td_rates.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    return out


def load() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "td_rates.parquet")
