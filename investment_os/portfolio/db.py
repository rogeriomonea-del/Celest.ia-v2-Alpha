"""Banco da Fase 5 (SQLite) com migrations versionadas.

- Funciona em banco criado do zero e em banco existente (aplica só pendentes).
- Snapshots/versões nunca são sobrescritos (UNIQUE + INSERT-only).
- audit_log recebe SOMENTE conteúdo sanitizado: eventos, hashes e contagens —
  nunca valores financeiros pessoais, nomes de arquivo originais ou PII.
- Alvo de produção: PostgreSQL (ADR-0002/0004); o SQL usa subset compatível.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .. import config

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_db_path() -> Path:
    return config.DATA_DIR / "portfolio.db"


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    migrate(conn)
    return conn


def applied_migrations(conn: sqlite3.Connection) -> list[str]:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    return [r["name"] for r in conn.execute("SELECT name FROM schema_migrations ORDER BY name")]


def migrate(conn: sqlite3.Connection) -> list[str]:
    """Aplica migrations pendentes em ordem; retorna as aplicadas agora."""
    done = set(applied_migrations(conn))
    applied: list[str] = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in done:
            continue
        conn.executescript(path.read_text(encoding="utf-8"))
        conn.execute(
            "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
            (path.name, utcnow()),
        )
        applied.append(path.name)
    conn.commit()
    return applied


def audit(conn: sqlite3.Connection, event: str, **details) -> None:
    """Auditoria sanitizada. NUNCA passe PII ou valores de carteira aqui."""
    conn.execute(
        "INSERT INTO audit_log (created_at, event, details_json) VALUES (?, ?, ?)",
        (utcnow(), event, json.dumps(details, ensure_ascii=False, default=str)),
    )
    conn.commit()


def add_issue(conn: sqlite3.Connection, scope: str, ref_id: int | None, severity: str, description: str) -> None:
    conn.execute(
        "INSERT INTO data_quality_issue (created_at, scope, ref_id, severity, description)"
        " VALUES (?, ?, ?, ?, ?)",
        (utcnow(), scope, ref_id, severity, description),
    )
    conn.commit()
