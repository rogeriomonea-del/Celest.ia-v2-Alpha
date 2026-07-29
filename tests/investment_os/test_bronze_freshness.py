"""Resolução de bronze fixo-vs-datado por recência de ingestão + imutabilidade.

Cobre os achados I2 e M3 da auditoria da Fase 7: a variante datada não tem
preferência incondicional (um ano fechado re-baixado completo vence parciais)
e um bruto existente sem sidecar nunca é sobrescrito."""
import json

import pytest

from investment_os.cli import _bronze
from investment_os.ingestion.base import fetch_bronze

SRC = "tesouro_transparente"
NAME = "precotaxatesourodireto.csv"
URL = ("https://www.tesourotransparente.gov.br/ckan/dataset/x/resource/y/"
       "download/precotaxatesourodireto.csv")


def _mk(base, filename, content, downloaded_at):
    p = base / filename
    p.write_bytes(content)
    p.with_suffix(p.suffix + ".meta.json").write_text(
        json.dumps({"downloaded_at": downloaded_at}), encoding="utf-8")
    return p


@pytest.fixture()
def bronze_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("investment_os.config.BRONZE_DIR", tmp_path)
    monkeypatch.setattr("investment_os.config.AUDIT_DIR", tmp_path / "audit")
    d = tmp_path / SRC
    d.mkdir()
    return d


class TestBronzeResolver:
    def test_datada_mais_recente_vence_fixo_antigo(self, bronze_dir):
        _mk(bronze_dir, NAME, b"fixo-velho", "2026-07-20T10:00:00+00:00")
        _mk(bronze_dir, "precotaxatesourodireto.2026-07-28.csv", b"datado-novo",
            "2026-07-28T10:00:00+00:00")
        assert _bronze(NAME, SRC).name.endswith("2026-07-28.csv")

    def test_fixo_reingerido_apos_virada_vence_datada_parcial(self, bronze_dir):
        # cenário de rollover: ano fechou; download completo (nome fixo) é
        # mais recente que a variante datada parcial do ano corrente
        _mk(bronze_dir, "precotaxatesourodireto.2026-07-28.csv", b"parcial",
            "2026-07-28T10:00:00+00:00")
        _mk(bronze_dir, NAME, b"completo", "2027-02-01T10:00:00+00:00")
        assert _bronze(NAME, SRC).name == NAME

    def test_sem_meta_usa_mtime_e_nao_quebra(self, bronze_dir):
        (bronze_dir / NAME).write_bytes(b"sem-meta")
        assert _bronze(NAME, SRC).name == NAME

    def test_ausente_sai_com_mensagem(self, bronze_dir):
        with pytest.raises(SystemExit):
            _bronze("nao_existe.csv", SRC)


class TestImutabilidadeSemSidecar:
    def test_bruto_existente_sem_meta_nunca_e_sobrescrito(self, bronze_dir):
        alvo = bronze_dir / NAME
        alvo.write_bytes(b"conteudo-original")
        # sem meta: fetch_bronze deve re-registrar (hash+meta) SEM re-download
        # e SEM overwrite — se tentasse rede, quebraria (URL não responde)
        out = fetch_bronze(SRC, URL, NAME)
        assert out == alvo and alvo.read_bytes() == b"conteudo-original"
        meta = json.loads(alvo.with_suffix(".csv.meta.json").read_text(encoding="utf-8"))
        assert meta["sha256"] and "preexistente" in meta["note"]

    def test_com_meta_retorna_direto(self, bronze_dir):
        _mk(bronze_dir, NAME, b"x", "2026-07-28T00:00:00+00:00")
        assert fetch_bronze(SRC, URL, NAME).read_bytes() == b"x"
