"""Gold macro: regimes classificados + séries recentes + expectativas Focus."""
from __future__ import annotations

import json
from datetime import date

from .. import config
from ..engine import regimes as R
from ..silver import macro as sv_macro


def _focus_next_year_median(focus_df) -> tuple[float | None, str | None]:
    """Mediana Focus do IPCA para o ANO SEGUINTE, pesquisa mais recente."""
    if focus_df is None:
        return None, None
    df = focus_df[focus_df["Indicador"] == "IPCA"]
    if df.empty or "DataReferencia" not in df.columns:
        return None, None
    next_year = str(date.today().year + 1)
    df = df[df["DataReferencia"].astype(str) == next_year]
    if "baseCalculo" in df.columns:
        df = df[df["baseCalculo"] == 0]
    if df.empty:
        return None, None
    last = df.sort_values("Data").iloc[-1]
    return float(last["Mediana"]), str(last["Data"])


def build(*, today: date | None = None) -> dict:
    today = today or date.today()
    series = sv_macro.load_series()
    focus = sv_macro.load_focus()

    s = lambda sid: sv_macro.series_dict(series, sid)  # noqa: E731
    focus_median, focus_date = _focus_next_year_median(focus)

    regimes = [
        R.inflacao(s("ipca_mensal"), today=today),
        R.politica_monetaria(s("selic_meta"), today=today),
        R.atividade(s("ibc_br"), today=today),
        R.cambio(s("ptax_venda"), today=today),
        R.risco_fiscal(s("divida_bruta_pib"), today=today),
        R.expectativas_inflacao(focus_median, focus_date),
    ]

    recent: dict[str, list] = {}
    for sid in ("selic_meta", "ipca_mensal", "ptax_venda", "ibc_br", "divida_bruta_pib", "cdi_anual", "igp_m"):
        pts = s(sid)[-36:]
        if pts:
            recent[sid] = [{"data": d.isoformat(), "valor": v} for d, v in pts]

    payload = {
        "data_geracao": today.isoformat(),
        "regimes": [r.to_dict() for r in regimes],
        "series_recentes": recent,
        "premissas": [
            f"meta de inflação de referência {R.META_IPCA_PCT:.1f}% ± {R.TOLERANCIA_IPCA_PP:.1f} p.p. (parametrizável)",
            "regras de classificação documentadas em investment_os/engine/regimes.py (determinísticas, testadas)",
            "macro NUNCA justifica comprar empresa ruim: uso restrito a cenário, sensibilidade, risco e ritmo de aportes",
        ],
        "fontes": {
            "bcb_sgs": "https://api.bcb.gov.br (séries 432, 4389, 433, 1, 24363, 189, 13762)",
            "bcb_focus": "https://olinda.bcb.gov.br (Expectativas de Mercado — EXPECTATIVA, não fato)",
        },
        "fora_do_escopo_desta_fase": [
            "matriz geopolítica: sem fonte oficial de eventos integrada — nada é pontuado (regra: rumor não pontua)",
            "macro global (FRED/IMF/BIS/ECB): registrado no SOURCE_REGISTRY, integração futura",
        ],
    }
    out = config.GOLD_DIR / "macro_regimes.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return payload
