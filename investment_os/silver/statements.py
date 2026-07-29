"""Silver de DFP/ITR: normalização para financial_facts point-in-time.

Regras (docs/METRIC_REGISTRY.md, docs/DATA_DICTIONARY.md):
- Demonstrações CONSOLIDADAS são a base (individual ignorado no MVP).
- Valores convertidos para R$ (ESCALA_MOEDA MIL -> x1000).
- Reapresentações: mantém-se a última VERSAO por (empresa, período, doc);
  bronze preserva todas; `n_versions` registra que houve reapresentação.
- DT_RECEB (recepção CVM) acompanha cada fato = data de conhecimento público.
- Apenas contas necessárias ao MVP são materializadas (documentado no ADR-0003).
"""
from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path

import pandas as pd

from .. import config

# Contas fixas do plano CVM usadas pelo motor (não financeiras e bancos).
NEEDED_CODES = {
    "DRE": {"3.01", "3.03", "3.05", "3.11", "3.11.01"},
    "BPA": {"1", "1.01.01", "1.01.02"},
    "BPP": {"2.01.04", "2.02.01", "2.03"},
    "DFC_MI": {"6.01", "6.02"},
}
# Contas detectadas por descrição (variam de código entre companhias — bancos
# e seguradoras usam template próprio, ex.: PL em 2.08 e lucro em 3.09/3.13).
_DA_RE = re.compile(r"deprecia|amortiza", re.IGNORECASE)
_CAPEX_RE = re.compile(r"imobilizad|intang[ií]vel", re.IGNORECASE)
_NCI_RE = re.compile(r"n[aã]o\s+controlador", re.IGNORECASE)
_PL_RE = re.compile(r"patrim[oô]nio l[ií]quido", re.IGNORECASE)
_NI_TOTAL_RE = re.compile(r"lucro/preju[ií]zo consolidado do per[ií]odo", re.IGNORECASE)
_NI_ATTRIB_RE = re.compile(r"atribu[ií]do a s[oó]cios da empresa controladora", re.IGNORECASE)
_LEVEL2_RE = re.compile(r"^\d\.\d{2}$")

_META_COLS = ["CNPJ_CIA", "DT_REFER", "VERSAO", "CD_CVM", "DT_RECEB", "LINK_DOC"]


def _read_zip_csv(zip_path: Path, member: str) -> pd.DataFrame | None:
    with zipfile.ZipFile(zip_path) as z:
        if member not in z.namelist():
            return None
        with z.open(member) as f:
            return pd.read_csv(
                io.TextIOWrapper(f, encoding="latin-1"), sep=";", dtype=str
            )


def _scale(df: pd.DataFrame) -> pd.Series:
    factor = df["ESCALA_MOEDA"].map({"MIL": 1000.0, "UNIDADE": 1.0})
    if factor.isna().any():
        bad = df.loc[factor.isna(), "ESCALA_MOEDA"].unique()
        raise ValueError(f"ESCALA_MOEDA desconhecida: {bad}")
    return pd.to_numeric(df["VL_CONTA"], errors="coerce") * factor


def extract_facts(zip_path: Path, doc_type: str, year: int) -> pd.DataFrame:
    """Extrai fatos consolidados necessários de um zip DFP/ITR da CVM."""
    prefix = f"{doc_type.lower()}_cia_aberta"
    frames: list[pd.DataFrame] = []
    for grupo in ("DRE", "BPA", "BPP", "DFC_MI"):
        df = _read_zip_csv(zip_path, f"{prefix}_{grupo}_con_{year}.csv")
        if df is None or df.empty:
            continue
        # Apenas moeda REAL: emissores estrangeiros que reportam em outra moeda
        # ficam fora do MVP (limitação declarada em docs/ASSUMPTIONS.md).
        if "MOEDA" in df.columns:
            df = df[df["MOEDA"] == "REAL"]
        level2 = df["CD_CONTA"].str.match(_LEVEL2_RE, na=False)
        keep = df["CD_CONTA"].isin(NEEDED_CODES[grupo])
        concept = pd.Series(pd.NA, index=df.index, dtype="object")
        if grupo == "DFC_MI":
            keep |= df["DS_CONTA"].str.contains(_DA_RE, na=False) | df[
                "DS_CONTA"
            ].str.contains(_CAPEX_RE, na=False)
        if grupo == "BPP":
            is_pl = level2 & df["DS_CONTA"].str.contains(_PL_RE, na=False)
            is_nci = df["DS_CONTA"].str.contains(_NCI_RE, na=False) & df[
                "CD_CONTA"
            ].str.count(r"\.").eq(2)
            concept[is_pl] = "equity_total"
            concept[is_nci] = "equity_nci"
            keep |= is_pl | is_nci
        if grupo == "DRE":
            is_ni = level2 & df["DS_CONTA"].str.contains(_NI_TOTAL_RE, na=False)
            is_attrib = df["DS_CONTA"].str.contains(_NI_ATTRIB_RE, na=False)
            is_eps = df["CD_CONTA"].str.startswith("3.99")
            concept[is_ni] = "net_income_total"
            concept[is_attrib] = "net_income_attrib"
            # EPS básico ON: 3.99.01.* com DS_CONTA "ON" (reais por ação).
            concept[
                is_eps
                & df["CD_CONTA"].str.startswith("3.99.01")
                & df["DS_CONTA"].str.strip().str.upper().str.startswith("ON")
            ] = "eps_on"
            keep |= is_ni | is_attrib | is_eps
        df = df[keep].copy()
        concept = concept.loc[df.index]
        if df.empty:
            continue
        df["concept"] = concept
        df["valor"] = _scale(df)
        # Contas por ação (3.99.*) são em R$/ação — ESCALA_MOEDA não se aplica.
        per_share = df["CD_CONTA"].str.startswith("3.99")
        if per_share.any():
            df.loc[per_share, "valor"] = pd.to_numeric(
                df.loc[per_share, "VL_CONTA"], errors="coerce"
            )
        df["grupo"] = grupo
        if "DT_INI_EXERC" not in df.columns:
            df["DT_INI_EXERC"] = pd.NA  # balanços (BPA/BPP) não têm período de fluxo
        frames.append(
            df[
                [
                    "CNPJ_CIA", "CD_CVM", "DENOM_CIA", "DT_REFER", "VERSAO",
                    "ORDEM_EXERC", "DT_INI_EXERC", "DT_FIM_EXERC",
                    "CD_CONTA", "DS_CONTA", "valor", "grupo", "concept",
                ]
            ]
        )
    if not frames:
        return pd.DataFrame()
    facts = pd.concat(frames, ignore_index=True)
    facts["doc_type"] = doc_type.upper()

    meta = _read_zip_csv(zip_path, f"{prefix}_{year}.csv")
    if meta is not None:
        meta = meta[[c for c in _META_COLS if c in meta.columns]].drop_duplicates(
            subset=["CNPJ_CIA", "DT_REFER", "VERSAO"]
        )
        facts = facts.merge(
            meta.drop(columns=["CD_CVM"], errors="ignore"),
            on=["CNPJ_CIA", "DT_REFER", "VERSAO"],
            how="left",
        )
    else:
        facts["DT_RECEB"] = pd.NA
        facts["LINK_DOC"] = pd.NA
    return facts


def build(dfp_zips: dict[int, Path], itr_zips: dict[int, Path]) -> Path:
    frames = [extract_facts(p, "DFP", y) for y, p in sorted(dfp_zips.items())]
    frames += [extract_facts(p, "ITR", y) for y, p in sorted(itr_zips.items())]
    facts = pd.concat([f for f in frames if not f.empty], ignore_index=True)

    facts = facts.rename(
        columns={
            "CNPJ_CIA": "cnpj", "CD_CVM": "cd_cvm", "DENOM_CIA": "denom_cia",
            "DT_REFER": "dt_refer", "VERSAO": "versao",
            "ORDEM_EXERC": "ordem_exerc", "DT_INI_EXERC": "dt_ini_exerc",
            "DT_FIM_EXERC": "dt_fim_exerc", "CD_CONTA": "cd_conta",
            "DS_CONTA": "ds_conta", "DT_RECEB": "dt_receb",
            "LINK_DOC": "link_doc",
        }
    )
    facts["cd_cvm"] = facts["cd_cvm"].astype(str).str.lstrip("0")
    facts["versao"] = pd.to_numeric(facts["versao"], errors="coerce")

    # Reapresentações: última versão por documento; contagem preservada.
    key = ["cd_cvm", "doc_type", "dt_refer"]
    latest = facts.groupby(key)["versao"].transform("max")
    facts["n_versions"] = facts.groupby(key)["versao"].transform("nunique")
    facts = facts[facts["versao"] == latest].copy()

    facts["source_id"] = "cvm_dados_abertos"
    out = config.SILVER_DIR / "financial_facts.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    facts.to_parquet(out, index=False)
    return out


def build_capital(dfp_zips: dict[int, Path], itr_zips: dict[int, Path]) -> Path:
    """Composição de capital (quantidade de ações) — última data por empresa.

    ATENÇÃO (data quality real): a escala do campo QT_* NÃO é uniforme entre
    companhias no dataset da CVM — algumas reportam em unidades, outras em
    milhares. Aqui os valores são preservados COMO REPORTADOS; a resolução de
    escala é feita na camada gold com validação cruzada contra o lucro por ação
    (conta 3.99 da DRE). Ações em tesouraria são subtraídas.
    """
    frames = []
    for doc, zips in (("dfp", dfp_zips), ("itr", itr_zips)):
        for year, path in sorted(zips.items()):
            df = _read_zip_csv(path, f"{doc}_cia_aberta_composicao_capital_{year}.csv")
            if df is not None and not df.empty:
                frames.append(df)
    cap = pd.concat(frames, ignore_index=True)
    for col in cap.columns:
        if col.startswith("QT_"):
            cap[col] = pd.to_numeric(cap[col], errors="coerce")
    cap = cap.sort_values(["CNPJ_CIA", "DT_REFER", "VERSAO"]).drop_duplicates(
        subset=["CNPJ_CIA"], keep="last"
    )
    cap["shares_on"] = cap["QT_ACAO_ORDIN_CAP_INTEGR"] - cap["QT_ACAO_ORDIN_TESOURO"]
    cap["shares_pn"] = cap["QT_ACAO_PREF_CAP_INTEGR"] - cap["QT_ACAO_PREF_TESOURO"]
    cap = cap.rename(
        columns={"CNPJ_CIA": "cnpj", "DT_REFER": "dt_refer_capital", "DENOM_CIA": "denom_cia"}
    )[["cnpj", "dt_refer_capital", "denom_cia", "shares_on", "shares_pn"]]
    cap["source_id"] = "cvm_dados_abertos"
    out = config.SILVER_DIR / "capital_composition.parquet"
    cap.to_parquet(out, index=False)
    return out


def load_facts() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "financial_facts.parquet")


def load_capital() -> pd.DataFrame:
    return pd.read_parquet(config.SILVER_DIR / "capital_composition.parquet")
