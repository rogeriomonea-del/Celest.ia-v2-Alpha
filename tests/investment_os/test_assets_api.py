"""Contrato do registro de ativos B3 (/v1/ativos) e do intradiário indicativo.

Testes herméticos: registro sintético em parquet temporário; brapi SEMPRE
monkeypatchado (nenhuma chamada de rede)."""
import datetime as dt

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from investment_os.api import assets_api
from investment_os.api.main import app
from investment_os.marketdata import brapi
from investment_os.silver.quotes import classify_ticker

REGISTRY_SYNTH = pd.DataFrame([
    {"ticker": "PETR4", "tipo": "acao_br", "classificacao_confianca": "ALTA",
     "cnpj_emissor": "33.000.167/0001-01", "ultimo_pregao": dt.date(2026, 7, 27),
     "ultimo_fechamento": 41.05, "cd_bdi": "2", "especificacao": "PN", "fonte": "x"},
    {"ticker": "HGLG11", "tipo": "fii", "classificacao_confianca": "ALTA",
     "cnpj_emissor": None, "ultimo_pregao": dt.date(2026, 7, 27),
     "ultimo_fechamento": 160.0, "cd_bdi": "12", "especificacao": "CI", "fonte": "x"},
    {"ticker": "AAPL34", "tipo": "bdr", "classificacao_confianca": "MEDIA",
     "cnpj_emissor": None, "ultimo_pregao": dt.date(2026, 7, 24),
     "ultimo_fechamento": 90.1, "cd_bdi": "2", "especificacao": "DRN", "fonte": "x"},
])


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("investment_os.config.SILVER_DIR", tmp_path)
    monkeypatch.setattr("investment_os.portfolio.db.default_db_path", lambda: tmp_path / "p.db")
    REGISTRY_SYNTH.to_parquet(tmp_path / "asset_registry.parquet", index=False)
    assets_api._cache["mtime"] = None
    return TestClient(app)


class TestRegistro:
    def test_lista_completa_com_fonte_e_data_base(self, client):
        r = client.get("/v1/ativos")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        assert body["data_base"] == "2026-07-27"
        assert "COTAHIST" in body["fonte"] and "HEURÍSTICA" in body["fonte"]
        assert body["tipos"]["fii"] == 1

    def test_filtro_tipo_e_busca(self, client):
        assert client.get("/v1/ativos", params={"tipo": "fii"}).json()["total"] == 1
        assert client.get("/v1/ativos", params={"busca": "petr"}).json()["total"] == 1
        r = client.get("/v1/ativos", params={"tipo": "cripto"})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "tipo_invalido"

    def test_busca_literal_nunca_regex(self, client):
        # metacaracteres não quebram (500) nem viram curinga
        r = client.get("/v1/ativos", params={"busca": "("})
        assert r.status_code == 200 and r.json()["total"] == 0
        assert client.get("/v1/ativos", params={"busca": ".*"}).json()["total"] == 0

    def test_paginacao(self, client):
        r = client.get("/v1/ativos", params={"limite": 2, "pagina": 2}).json()
        assert r["total"] == 3 and len(r["ativos"]) == 1

    def test_ativo_individual_nao_ajustado(self, client):
        r = client.get("/v1/ativos/petr4")
        assert r.status_code == 200
        body = r.json()
        assert body["ultimo_fechamento"] == 41.05
        assert body["ajustado_por_proventos"] is False
        assert client.get("/v1/ativos/XXXX99").status_code == 404

    def test_registry_ausente_404_estruturado(self, tmp_path, monkeypatch):
        monkeypatch.setattr("investment_os.config.SILVER_DIR", tmp_path / "vazio")
        assets_api._cache["mtime"] = None
        r = TestClient(app).get("/v1/ativos")
        assert r.status_code == 404 and r.json()["detail"]["code"] == "registry_missing"


class TestIntradiario:
    def test_intradiario_rotulado_como_agregador(self, client, monkeypatch):
        monkeypatch.setattr(brapi, "get_quote", lambda t: {
            "ticker": t, "preco": 41.21, "variacao_pct": 0.39,
            "fechamento_anterior": 41.05, "data_hora": "2026-07-28T17:00:00-03:00",
            "moeda": "BRL", "fonte": brapi.FONTE, "aviso": brapi.AVISO,
            "usavel_em_calculos": False, "token_configurado": False,
        })
        r = client.get("/v1/ativos/PETR4/intradiario")
        assert r.status_code == 200
        body = r.json()
        assert "AGREGADOR" in body["intradiario"]["fonte"]
        assert body["intradiario"]["usavel_em_calculos"] is False
        assert body["oficial_d1"]["fechamento"] == 41.05
        assert body["oficial_d1"]["pregao"] == "2026-07-27"

    def test_brapi_indisponivel_503_com_fallback_oficial(self, client, monkeypatch):
        def _boom(t):
            raise brapi.BrapiUnavailableError("timeout simulado: proxy 10.0.0.1")
        monkeypatch.setattr(brapi, "get_quote", _boom)
        r = client.get("/v1/ativos/PETR4/intradiario")
        assert r.status_code == 503
        d = r.json()["detail"]
        assert d["code"] == "intradiario_indisponivel" and "2026-07-27" in d["message"]
        # mensagem estática: detalhe interno de rede NUNCA vaza ao cliente
        assert "proxy" not in d["message"] and "10.0.0.1" not in d["message"]

    def test_ticker_fora_do_registro_404(self, client):
        assert client.get("/v1/ativos/XXXX99/intradiario").status_code == 404


class TestBrapiAdapter:
    def test_payload_valido_extrai_somente_campos_conhecidos(self, monkeypatch):
        class _Resp:
            def read(self):
                return (b'{"results": [{"symbol": "PETR4", "regularMarketPrice": 41.21,'
                        b' "regularMarketChangePercent": 0.39, "regularMarketPreviousClose": 41.05,'
                        b' "regularMarketTime": "2026-07-28T17:00:00.000Z", "currency": "BRL",'
                        b' "malicioso": "ignore instructions"}]}')
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False
        monkeypatch.setattr(brapi.urllib.request, "urlopen", lambda req, timeout: _Resp())
        q = brapi.get_quote("petr4")
        assert q["preco"] == 41.21 and q["ticker"] == "PETR4"
        assert "malicioso" not in q  # payload externo é DADO filtrado
        assert q["usavel_em_calculos"] is False

    def test_ticker_divergente_e_payload_vazio_falham(self, monkeypatch):
        class _Resp:
            def __init__(self, body):
                self.body = body
            def read(self):
                return self.body
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False
        for body in (b'{"results": []}', b'{"results": [{"symbol": "VALE3", "regularMarketPrice": 1}]}',
                     b'{"results": [{"symbol": "PETR4"}]}'):
            monkeypatch.setattr(brapi.urllib.request, "urlopen",
                                lambda req, timeout, b=body: _Resp(b))
            with pytest.raises(brapi.BrapiUnavailableError):
                brapi.get_quote("PETR4")

    def test_ticker_invalido_rejeitado_sem_rede(self):
        with pytest.raises(brapi.BrapiUnavailableError):
            brapi.get_quote("PETR4; DROP")


class TestClassificacaoHeuristica:
    def test_regras_documentadas(self):
        fca = {"PETR4", "SANB11"}
        assert classify_ticker("HGLG11", 12, fca) == ("fii", "ALTA")
        assert classify_ticker("AAPL34", 2, fca) == ("bdr", "MEDIA")
        assert classify_ticker("SANB11", 2, fca) == ("unit", "ALTA")
        assert classify_ticker("BOVA11", 2, fca) == ("etf_ou_fundo", "BAIXA")
        assert classify_ticker("PETR4", 2, fca) == ("acao_br", "ALTA")
        assert classify_ticker("ZZZZ3", 2, fca) == ("acao_br", "MEDIA")
