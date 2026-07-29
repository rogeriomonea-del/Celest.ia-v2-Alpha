"""Testes de contrato da API v1 (Fase 5) — fluxo ponta a ponta.

Fixtures sintéticas rotuladas; referência e preços monkeypatched (CI offline).
"""
import io

import pytest
from fastapi.testclient import TestClient

from investment_os.api.main import app
from investment_os.portfolio import db as pdb
from tests.investment_os.test_importer import REFERENCE_SYNTHETIC
from tests.investment_os.test_portfolio_analysis import PRICES_SYNTH, SECTORS_SYNTH
from tests.investment_os.test_profile_ips import FULL_ANSWERS

CSV_OK = (
    "ticker;quantidade;preco_medio;data_base\n"
    "VALE3;100;61,50;30/06/2026\n"
    "PETR4;200;38,10;30/06/2026\n"
    "HGLG11;50;;30/06/2026\n"
)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "investment_os.portfolio.db.default_db_path", lambda: tmp_path / "api.db"
    )
    monkeypatch.setattr(
        "investment_os.portfolio.importer.load_reference", lambda: REFERENCE_SYNTHETIC
    )
    monkeypatch.setattr(
        "investment_os.portfolio.analysis.load_prices",
        lambda tickers: {t: PRICES_SYNTH[t] for t in tickers if t in PRICES_SYNTH},
    )
    monkeypatch.setattr("investment_os.portfolio.analysis.load_sectors", lambda: SECTORS_SYNTH)
    return TestClient(app)


def _upload(client, content: str = CSV_OK, name: str = "carteira.csv"):
    return client.post(
        "/v1/portfolio/import",
        files={"file": (name, io.BytesIO(content.encode()), "text/csv")},
    )


def _confirm_ips(client):
    r = client.post("/v1/profile/assess", json={"answers": FULL_ANSWERS})
    assert r.status_code == 200
    r = client.post("/v1/policy/draft", json={"reason": "primeira IPS"})
    assert r.status_code == 200
    vid = r.json()["version_id"]
    assert client.post(f"/v1/policy/{vid}/confirm").status_code == 200


class TestProfileApi:
    def test_questoes_adaptativas(self, client):
        r = client.post("/v1/profile/questions", json={"answers": {}})
        assert r.status_code == 200
        ids = [q["id"] for q in r.json()]
        assert "horizonte" in ids and "conhecimento_derivativos" not in ids

    def test_assess_e_latest(self, client):
        r = client.post("/v1/profile/assess", json={"answers": FULL_ANSWERS})
        assert r.status_code == 200 and r.json()["confidence"] == "ALTA"
        r = client.get("/v1/profile/assessment/latest")
        assert r.status_code == 200 and "scores" in r.json()

    def test_latest_sem_avaliacao_404_estruturado(self, client):
        r = client.get("/v1/profile/assessment/latest")
        assert r.status_code == 404 and r.json()["detail"]["code"] == "no_assessment"


class TestPolicyApi:
    def test_draft_sem_questionario_409(self, client):
        r = client.post("/v1/policy/draft", json={"reason": "teste"})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "no_assessment"

    def test_draft_confirm_versions(self, client):
        client.post("/v1/profile/assess", json={"answers": FULL_ANSWERS})
        r = client.post("/v1/policy/draft", json={"reason": "primeira versão"})
        assert r.status_code == 200 and r.json()["status"] == "draft"
        assert client.get("/v1/policy/confirmed").status_code == 404  # draft não vale
        client.post(f"/v1/policy/{r.json()['version_id']}/confirm")
        r2 = client.get("/v1/policy/confirmed")
        assert r2.status_code == 200 and "faixas_por_classe" in r2.json()["content"]
        assert len(client.get("/v1/policy/versions").json()) == 1

    def test_validacao_de_entrada(self, client):
        assert client.post("/v1/policy/draft", json={"reason": ""}).status_code == 422


class TestImportApi:
    def test_fluxo_upload_preview_confirm(self, client):
        r = _upload(client)
        assert r.status_code == 200
        prev = r.json()
        assert prev["counts"]["ok"] == 2 and prev["counts"]["ambiguous"] == 1
        assert prev["pii_removed_count"] == 0
        import_id = prev["import_id"]

        amb = next(x for x in prev["rows"] if x["status"] == "ambiguous")
        r = client.post(
            f"/v1/portfolio/import/{import_id}/rows/{amb['row_id']}/correct",
            json={"ticker": "HGLG11", "asset_class": "fii"},
        )
        assert r.status_code == 200 and r.json()["counts"]["ok"] == 3

        r = client.post(f"/v1/portfolio/import/{import_id}/confirm", json={})
        assert r.status_code == 200 and r.json()["version"] == 1

    def test_confirmacao_parcial_bloqueada_sem_aceite(self, client):
        r = _upload(client)
        import_id = r.json()["import_id"]
        r = client.post(f"/v1/portfolio/import/{import_id}/confirm", json={})
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "confirm_rejected"

    def test_arquivo_invalido_422_sem_conteudo(self, client):
        r = _upload(client, content="colA;colB\n1;2\n")
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert detail["code"] == "import_invalid" and "colA" not in detail["message"]

    def test_extensao_errada(self, client):
        r = client.post(
            "/v1/portfolio/import",
            files={"file": ("x.exe", io.BytesIO(b"MZ\x90"), "application/octet-stream")},
        )
        assert r.status_code == 422


class TestPortfolioApi:
    def _snapshot(self, client) -> int:
        r = _upload(client)
        import_id = r.json()["import_id"]
        r = client.post(
            f"/v1/portfolio/import/{import_id}/confirm", json={"accept_partial": True}
        )
        return r.json()["snapshot_id"]

    def test_snapshots_e_posicoes(self, client):
        sid = self._snapshot(client)
        assert len(client.get("/v1/portfolio/snapshots").json()) == 1
        pos = client.get(f"/v1/portfolio/snapshots/{sid}").json()["positions"]
        assert {p["ticker"] for p in pos} == {"VALE3", "PETR4"}

    def test_analysis(self, client):
        sid = self._snapshot(client)
        a = client.get(f"/v1/portfolio/snapshots/{sid}/analysis").json()
        assert a["patrimonio_precificado_brl"] > 0
        assert "por_classe" in a["pesos"]

    def test_rebalance_bloqueado_sem_ips(self, client):
        sid = self._snapshot(client)
        r = client.post(f"/v1/portfolio/snapshots/{sid}/rebalance", json={})
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "policy_not_confirmed"

    def test_rebalance_com_ips(self, client):
        _confirm_ips(client)
        sid = self._snapshot(client)
        r = client.post(f"/v1/portfolio/snapshots/{sid}/rebalance", json={"months": 6})
        assert r.status_code == 200
        plan = r.json()
        assert plan["proximo_aporte"] and len(plan["plano_6_meses"]) == 6
        assert plan["premissas"]

    def test_openapi_coerente(self, client):
        spec = client.get("/openapi.json").json()
        paths = spec["paths"]
        for p in ("/v1/profile/assess", "/v1/policy/draft", "/v1/portfolio/import",
                  "/v1/portfolio/snapshots/{snapshot_id}/rebalance"):
            assert p in paths
