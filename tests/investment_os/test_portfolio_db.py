"""Migrations: banco do zero, incremental e imutabilidade de snapshots."""
import sqlite3

import pytest

from investment_os.portfolio import db as pdb


@pytest.fixture()
def conn(tmp_path):
    c = pdb.connect(tmp_path / "test.db")
    yield c
    c.close()


class TestMigrations:
    def test_do_zero_cria_todas_as_tabelas(self, conn):
        tables = {
            r["name"]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        expected = {
            "investor_profile", "profile_assessment", "investment_goal",
            "investment_policy", "policy_version", "policy_constraint",
            "portfolio", "portfolio_import", "portfolio_import_row",
            "instrument_resolution", "portfolio_snapshot", "position",
            "position_source", "rebalance_plan", "rebalance_action",
            "contribution_plan", "data_quality_issue", "audit_log",
            "schema_migrations",
        }
        assert expected <= tables

    def test_incremental_nao_reaplica(self, tmp_path):
        c1 = pdb.connect(tmp_path / "x.db")
        first = pdb.applied_migrations(c1)
        c1.close()
        c2 = pdb.connect(tmp_path / "x.db")  # reconectar: nada pendente
        assert pdb.migrate(c2) == []
        assert pdb.applied_migrations(c2) == first
        c2.close()

    def test_snapshot_nao_pode_ser_sobrescrito(self, conn):
        conn.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, 'x')")
        conn.execute(
            "INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, 'x', 'p')"
        )
        conn.execute(
            "INSERT INTO portfolio_snapshot (portfolio_id, version, created_at, content_sha256)"
            " VALUES (1, 1, 'x', 'h1')"
        )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO portfolio_snapshot (portfolio_id, version, created_at, content_sha256)"
                " VALUES (1, 1, 'y', 'h2')"
            )


class TestAudit:
    def test_audit_gravado(self, conn):
        pdb.audit(conn, "teste_evento", file_sha256="abc", rows=3)
        row = conn.execute("SELECT * FROM audit_log").fetchone()
        assert row["event"] == "teste_evento"
        assert "abc" in row["details_json"]
