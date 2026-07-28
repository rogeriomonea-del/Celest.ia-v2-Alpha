"""Silver macro: séries SGS tipadas + expectativas Focus normalizadas.

Point-in-time: valores com data futura à ingestão são descartados (a meta
Selic publica vigência futura no SGS) — registrado como limitação da fonte.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from .. import config
from ..ingestion.bcb import SGS_SERIES


def build_sgs(bronze_files: dict[int, Path], *, today: date | None = None) -> Path:
    today = today or date.today()
    frames = []
    for codigo, path in bronze_files.items():
        serie_id, desc, unit, freq = SGS_SERIES[codigo]
        rows = json.loads(Path(path).read_text(encoding="utf-8"))
        df = pd.DataFrame(rows)
        if df.empty:
            continue
        df["data"] = pd.to_datetime(df["data"], format="%d/%m/%Y").dt.date
        df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
        df = df.dropna(subset=["valor"])
        df = df[df["data"] <= today]  # point-in-time: sem vigência futura
        df["serie_id"] = serie_id
        df["sgs_codigo"] = codigo
        df["descricao"] = desc
        df["unidade"] = unit
        df["frequencia"] = freq
        df["source_id"] = "bcb_sgs"
        frames.append(df)
    out_df = pd.concat(frames, ignore_index=True).sort_values(["serie_id", "data"])
    out = config.SILVER_DIR / "macro_series.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_parquet(out, index=False)
    return out


def build_focus(bronze_files: dict[str, Path]) -> Path | None:
    frames = []
    for indicador, path in bronze_files.items():
        if not isinstance(path, (str, Path)) or not Path(path).exists():
            continue
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        df = pd.DataFrame(payload.get("value", []))
        if df.empty:
            continue
        df["source_id"] = "bcb_focus"
        frames.append(df)
    if not frames:
        return None
    out_df = pd.concat(frames, ignore_index=True)
    out_df["Data"] = pd.to_datetime(out_df["Data"]).dt.date
    out = config.SILVER_DIR / "focus_expectations.parquet"
    out_df.to_parquet(out, index=False)
    return out


def load_series() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "macro_series.parquet")


def load_focus() -> pd.DataFrame | None:
    path = config.SILVER_DIR / "focus_expectations.parquet"
    return pd.read_parquet(path) if path.exists() else None


def series_dict(df: pd.DataFrame, serie_id: str) -> list[tuple[date, float]]:
    sub = df[df["serie_id"] == serie_id].sort_values("data")
    return list(zip(sub["data"], sub["valor"].astype(float)))
