"""Painel Tesouro completo — modelagem por tipo e radar (fixture sintética)."""
from datetime import date

import pandas as pd
import pytest

from investment_os.reports import tesouro_full


@pytest.fixture()
def synth_silver(monkeypatch):
    """FIXTURE SINTÉTICA (não são taxas reais) cobrindo os tipos de título."""
    base = date(2026, 7, 27)
    rows = []

    def add(tipo, venc, taxa, n_hist=300, taxa_hist=None):
        for i in range(n_hist):
            d = date(2025, 1, 1) + pd.Timedelta(days=i).to_pytimedelta()
            rows.append({"tipo_titulo": tipo, "dt_vencimento": venc, "data_base": d,
                         "taxa_compra_manha": taxa_hist if taxa_hist is not None else taxa - 1.0,
                         "taxa_venda_manha": taxa, "pu_compra_manha": 800.0,
                         "pu_venda_manha": 799.0, "pu_base_manha": 799.0})
        rows.append({"tipo_titulo": tipo, "dt_vencimento": venc, "data_base": base,
                     "taxa_compra_manha": taxa, "taxa_venda_manha": taxa + 0.1,
                     "pu_compra_manha": 800.0, "pu_venda_manha": 799.0, "pu_base_manha": 799.0})

    add("Tesouro IPCA+", date(2050, 8, 15), 7.4)                       # modelado + radar
    add("Tesouro Prefixado", date(2032, 1, 1), 13.0)                   # modelado + radar
    add("Tesouro Prefixado com Juros Semestrais", date(2035, 1, 1), 13.5)
    add("Tesouro Selic", date(2029, 3, 1), 0.05)                       # não modelado
    add("Tesouro Renda+ Aposentadoria Extra", date(2059, 12, 15), 7.0) # não modelado
    add("Tesouro IPCA+", date(2027, 5, 15), 9.0)                       # < 1 ano: fora do radar
    df = pd.DataFrame(rows)
    monkeypatch.setattr("investment_os.silver.tesouro.load", lambda: df)
    return df


class TestPainel:
    def test_tipos_modelados_tem_risco(self, synth_silver, tmp_path, monkeypatch):
        monkeypatch.setattr("investment_os.config.GOLD_DIR", tmp_path)
        p = tesouro_full.build()
        by_tipo = {(t["tipo"], t["vencimento"]): t for t in p["titulos"]}
        ipca = by_tipo[("Tesouro IPCA+", "2050-08-15")]
        assert ipca["modelado"] and ipca["modified_duration_anos"] > 15
        assert len(ipca["cenarios_mtm"]) == 8
        pref = by_tipo[("Tesouro Prefixado com Juros Semestrais", "2035-01-01")]
        # cupom de 10% encurta a duration vs zero-coupon do mesmo prazo
        assert pref["modelado"] and pref["modified_duration_anos"] < 8.5

    def test_nao_modelados_declaram_motivo(self, synth_silver, tmp_path, monkeypatch):
        monkeypatch.setattr("investment_os.config.GOLD_DIR", tmp_path)
        p = tesouro_full.build()
        selic = next(t for t in p["titulos"] if t["tipo"] == "Tesouro Selic")
        assert selic["modelado"] is False and "pós-fixado" in selic["motivo_nao_modelado"]
        renda = next(t for t in p["titulos"] if "Renda+" in t["tipo"])
        assert renda["modelado"] is False and "não modelada" in renda["motivo_nao_modelado"]
        assert "duration_macaulay_anos" not in selic  # nunca número inventado

    def test_radar_exige_percentil_e_prazo(self, synth_silver, tmp_path, monkeypatch):
        monkeypatch.setattr("investment_os.config.GOLD_DIR", tmp_path)
        p = tesouro_full.build()
        keys = {(j["tipo"], j["vencimento"]) for j in p["radar_janelas"]}
        assert ("Tesouro IPCA+", "2050-08-15") in keys       # taxa atual no topo da série
        assert ("Tesouro IPCA+", "2027-05-15") not in keys   # < 1 ano até o vencimento
        assert ("Tesouro Selic", "2029-03-01") not in keys   # não modelado
        j = next(x for x in p["radar_janelas"] if x["vencimento"] == "2050-08-15")
        assert "invalidacao" in j and "recomendação" in j["nota"]

    def test_curvas_separam_nominal_e_real(self, synth_silver, tmp_path, monkeypatch):
        monkeypatch.setattr("investment_os.config.GOLD_DIR", tmp_path)
        p = tesouro_full.build()
        tipos_nominal = {pt["tipo"] for pt in p["curvas"]["nominal_prefixado"]}
        tipos_real = {pt["tipo"] for pt in p["curvas"]["real_ipca"]}
        assert tipos_nominal <= {"Tesouro Prefixado", "Tesouro Prefixado com Juros Semestrais"}
        assert tipos_real <= {"Tesouro IPCA+", "Tesouro IPCA+ com Juros Semestrais"}
        assert "ANBIMA" in p["fonte"]
