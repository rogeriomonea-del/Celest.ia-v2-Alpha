"""Contrato da API Fase 6 (macro/tesouro/overview) com gold sintético."""
import json

import pytest
from fastapi.testclient import TestClient

from investment_os.api.main import app

MACRO_SYNTH = {
    "data_geracao": "2026-07-28",
    "regimes": [{"dimensao": "inflacao", "estado": "estavel", "detalhe": "x",
                 "confianca": "ALTA", "data_base": "2026-06-01", "fonte": "bcb_sgs:433",
                 "natureza": "FATO"}],
    "series_recentes": {"selic_meta": [{"data": "2026-07-28", "valor": 14.25}]},
    "premissas": [], "fontes": {}, "fora_do_escopo_desta_fase": [],
}
TESOURO_SYNTH = {
    "data_base": "2026-07-27",
    "fonte": "Tesouro Transparente — varejo; NÃO é curva ANBIMA",
    "titulos": [
        {"tipo": "Tesouro IPCA+", "vencimento": "2050-08-15", "data_base": "2026-07-27",
         "taxa_compra_pct": 7.37, "modelado": True, "duration_macaulay_anos": 24.0,
         "modified_duration_anos": 22.4, "dv01_brl": 0.4, "convexidade": 550.0,
         "cenarios_mtm": [{"choque_bps": 100, "pu_novo": 700.0, "variacao_pct": -19.0,
                           "taxa_pct": 8.37, "efeito_duration_brl": -1.0,
                           "efeito_convexidade_brl": 0.1, "residuo_brl": 0.0}],
         "historico": {"pregoes": 369, "percentil_taxa_atual": 94.3}},
        {"tipo": "Tesouro Selic", "vencimento": "2029-03-01", "data_base": "2026-07-27",
         "taxa_compra_pct": 0.05, "modelado": False,
         "motivo_nao_modelado": "pós-fixado repactuado diariamente"},
    ],
    "curvas": {"nominal_prefixado": [], "real_ipca": [], "nota": "x"},
    "radar_janelas": [], "parametros_radar": {}, "historico_oficial_desde": "2004-12-31",
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("investment_os.config.GOLD_DIR", tmp_path)
    monkeypatch.setattr("investment_os.portfolio.db.default_db_path", lambda: tmp_path / "p.db")
    (tmp_path / "macro_regimes.json").write_text(json.dumps(MACRO_SYNTH), encoding="utf-8")
    (tmp_path / "tesouro_paineis.json").write_text(json.dumps(TESOURO_SYNTH), encoding="utf-8")
    return TestClient(app)


class TestMacroApi:
    def test_regimes(self, client):
        r = client.get("/v1/macro/regimes")
        assert r.status_code == 200 and r.json()["regimes"][0]["dimensao"] == "inflacao"

    def test_serie_existente_e_ausente(self, client):
        assert client.get("/v1/macro/series/selic_meta").status_code == 200
        r = client.get("/v1/macro/series/nao_existe")
        assert r.status_code == 404 and r.json()["detail"]["code"] == "serie_not_found"


class TestTesouroApi:
    def test_titulos_sem_cenarios_pesados(self, client):
        r = client.get("/v1/tesouro/titulos")
        assert r.status_code == 200
        body = r.json()
        assert all("cenarios_mtm" not in t for t in body["titulos"])
        assert "ANBIMA" in body["fonte"]

    def test_cenarios_de_titulo_modelado(self, client):
        r = client.get("/v1/tesouro/titulos/Tesouro IPCA+/2050-08-15/cenarios")
        assert r.status_code == 200 and r.json()["cenarios_mtm"]

    def test_nao_modelado_409(self, client):
        r = client.get("/v1/tesouro/titulos/Tesouro Selic/2029-03-01/cenarios")
        assert r.status_code == 409 and r.json()["detail"]["code"] == "nao_modelado"

    def test_titulo_inexistente_404(self, client):
        r = client.get("/v1/tesouro/titulos/Tesouro IPCA+/2099-01-01/cenarios")
        assert r.status_code == 404


class TestOverview:
    def test_blocos_declaram_ausencia(self, client, tmp_path):
        (tmp_path / "macro_regimes.json").unlink()
        r = client.get("/v1/overview")
        assert r.status_code == 200
        body = r.json()
        assert body["macro"]["status"] == "indisponivel"
        assert body["tesouro"]["n_titulos"] == 2
        assert body["carteira"]["snapshots"] == 0
        assert body["carteira"]["ips_confirmada"] is False

    def test_gold_ausente_404_estruturado(self, client, tmp_path):
        (tmp_path / "tesouro_paineis.json").unlink()
        r = client.get("/v1/tesouro/titulos")
        assert r.status_code == 404 and r.json()["detail"]["code"] == "gold_missing"
