"""Download de documentos oficiais (pacote ENET da CVM) com hash e auditoria.

Escrita restrita a data/documents/ (regra do document-research-agent).
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from .. import config
from ..ingestion.base import fetch_bronze


def fetch_enet_package(cd_cvm: str, doc_label: str, link_doc: str) -> dict:
    """Baixa o pacote ENET (zip) e extrai o PDF oficial.

    Retorna metadados: caminhos, sha256 do zip e do PDF, páginas, timestamps.
    """
    url = link_doc.replace("http://", "https://")
    safe = doc_label.replace("/", "-")
    zip_path = fetch_bronze("cvm_dados_abertos", url, f"enet_{cd_cvm}_{safe}.zip")

    doc_dir = config.DOCUMENTS_DIR / cd_cvm
    doc_dir.mkdir(parents=True, exist_ok=True)
    pdf_path: Path | None = None
    with zipfile.ZipFile(zip_path) as z:
        pdfs = [n for n in z.namelist() if n.lower().endswith(".pdf")]
        if pdfs:
            member = max(pdfs, key=lambda n: z.getinfo(n).file_size)
            pdf_path = doc_dir / f"{safe}.pdf"
            pdf_path.write_bytes(z.read(member))

    meta = {
        "cd_cvm": cd_cvm,
        "doc_label": doc_label,
        "url": url,
        "zip_sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest(),
        "pdf_path": str(pdf_path) if pdf_path else None,
        "pdf_sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest() if pdf_path else None,
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_id": "cvm_dados_abertos",
    }
    (doc_dir / f"{safe}.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return meta
