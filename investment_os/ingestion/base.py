"""Camada bronze: download auditado e imutável de arquivos oficiais.

Cada download gera:
- o arquivo bruto em data/bronze/<source_id>/<nome>;
- um sidecar <nome>.meta.json com url, sha256, bytes e timestamps;
- uma linha de auditoria em data/audit/ingestion_runs.jsonl (append-only).

Um arquivo bronze nunca é sobrescrito: se o conteúdo remoto mudar (sha256
diferente), a nova versão é gravada com sufixo de data e a anterior preservada.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .. import config
from ..registry.sources import assert_official

_last_request_at: dict[str, float] = {}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _audit(record: dict) -> None:
    config.AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    with open(config.AUDIT_DIR / "ingestion_runs.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _rate_limit(url: str) -> None:
    host = url.split("/")[2]
    elapsed = time.monotonic() - _last_request_at.get(host, 0.0)
    if elapsed < config.REQUEST_INTERVAL_S:
        time.sleep(config.REQUEST_INTERVAL_S - elapsed)
    _last_request_at[host] = time.monotonic()


def fetch_bronze(
    source_id: str,
    url: str,
    filename: str,
    *,
    cache_file: Path | None = None,
) -> Path:
    """Baixa (ou registra a partir de cache local) um arquivo bronze.

    `cache_file` permite registrar um arquivo já baixado da MESMA url (mesma
    sessão), evitando re-download; o hash e a auditoria são gerados igualmente.
    Retorna o caminho do arquivo bronze.
    """
    assert_official(url)
    target_dir = config.BRONZE_DIR / source_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename
    started = _utcnow()

    if target.exists():
        # Imutabilidade: um bruto existente NUNCA é sobrescrito.
        meta_path = target.with_suffix(target.suffix + ".meta.json")
        if meta_path.exists():
            return target
        # Sidecar ausente (estado parcial): re-registra hash/meta/auditoria a
        # partir do arquivo existente, sem re-download e sem overwrite.
        digest = _sha256(target)
        meta = {
            "source_id": source_id,
            "url": url,
            "sha256": digest,
            "bytes": target.stat().st_size,
            "downloaded_at": _utcnow(),
            "immutable": True,
            "note": "meta regenerado de bruto preexistente (sidecar ausente)",
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        _audit({"source_id": source_id, "url": url, "file": filename, "sha256": digest,
                "bytes": meta["bytes"], "status": "meta_regenerated",
                "started_at": started, "finished_at": _utcnow()})
        return target

    tmp = target.with_suffix(target.suffix + ".part")
    error: str | None = None
    if cache_file is not None and Path(cache_file).exists():
        tmp.write_bytes(Path(cache_file).read_bytes())
    else:
        req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
        for attempt, backoff in enumerate((0,) + config.RETRY_BACKOFF_S):
            if backoff:
                time.sleep(backoff)
            try:
                _rate_limit(url)
                with urllib.request.urlopen(req, timeout=300) as resp, open(tmp, "wb") as out:
                    while chunk := resp.read(1 << 20):
                        out.write(chunk)
                error = None
                break
            except Exception as exc:  # noqa: BLE001 - auditamos e re-tentamos
                error = f"{type(exc).__name__}: {exc}"
        if error is not None:
            _audit(
                {
                    "source_id": source_id,
                    "url": url,
                    "file": filename,
                    "status": "error",
                    "error": error,
                    "started_at": started,
                    "finished_at": _utcnow(),
                }
            )
            raise RuntimeError(f"Falha ao baixar {url}: {error}")

    tmp.rename(target)
    digest = _sha256(target)
    meta = {
        "source_id": source_id,
        "url": url,
        "sha256": digest,
        "bytes": target.stat().st_size,
        "downloaded_at": _utcnow(),
        "immutable": True,
    }
    target.with_suffix(target.suffix + ".meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _audit(
        {
            "source_id": source_id,
            "url": url,
            "file": filename,
            "sha256": digest,
            "bytes": meta["bytes"],
            "status": "ok",
            "started_at": started,
            "finished_at": _utcnow(),
        }
    )
    return target
