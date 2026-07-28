"""Silver de listagens: mapeamento oficial CNPJ/cd_cvm -> códigos de negociação.

Fonte: FCA da CVM (fca_cia_aberta_valor_mobiliario). Ticker nunca é chave
primária de emissor — aqui ele é atributo de listagem ativa em Bolsa (B3).
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pandas as pd

from .. import config

_CLASS_BY_VM = {
    "Ações Ordinárias": "ON",
    "Ações Preferenciais": "PN",
    "Units": "UNIT",
    "Certificado de Depósito de Ações": "UNIT",
}


def build(fca_zips: dict[int, Path]) -> Path:
    frames = []
    for year, path in sorted(fca_zips.items()):
        with zipfile.ZipFile(path) as z:
            member = f"fca_cia_aberta_valor_mobiliario_{year}.csv"
            if member not in z.namelist():
                continue
            with z.open(member) as f:
                frames.append(
                    pd.read_csv(io.TextIOWrapper(f, encoding="latin-1"), sep=";", dtype=str)
                )
    df = pd.concat(frames, ignore_index=True)
    df = df[df["Mercado"].fillna("") == "Bolsa"]
    df = df[df["Sigla_Entidade_Administradora"].fillna("") == "B3"]
    df = df[df["Codigo_Negociacao"].notna()]
    # Sem data de fim de negociação = listagem ativa.
    if "Data_Fim_Negociacao" in df.columns:
        df = df[df["Data_Fim_Negociacao"].isna() | (df["Data_Fim_Negociacao"] == "")]
    df["classe"] = df["Valor_Mobiliario"].map(_CLASS_BY_VM)
    df = df[df["classe"].notna()]

    out_df = (
        df.rename(
            columns={
                "CNPJ_Companhia": "cnpj",
                "Nome_Empresarial": "nome",
                "Codigo_Negociacao": "ticker",
                "Data_Referencia": "dt_referencia",
            }
        )[["cnpj", "nome", "ticker", "classe", "dt_referencia"]]
        .assign(ticker=lambda d: d["ticker"].str.strip().str.upper())
        .sort_values("dt_referencia")
        .drop_duplicates(subset=["cnpj", "ticker"], keep="last")
        .reset_index(drop=True)
    )
    out_df["source_id"] = "cvm_dados_abertos"
    out = config.SILVER_DIR / "listings.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_parquet(out, index=False)
    return out


def load() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "listings.parquet")
