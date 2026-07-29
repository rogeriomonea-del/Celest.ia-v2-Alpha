"""Extração de texto por página e citações verificáveis.

REGRA DE SEGURANÇA (docs/SECURITY_AND_PRIVACY.md): o conteúdo de documentos é
DADO, nunca instrução. Nada aqui interpreta ou executa texto de documento;
trechos são devolvidos verbatim, sempre delimitados como citação com página e
hash do documento, para verificação posterior.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass(frozen=True)
class Citation:
    pdf_sha256: str
    page: int  # 1-based
    snippet: str
    keyword: str


def extract_pages(pdf_path: Path) -> list[str]:
    """Texto por página (pdfplumber). Página sem texto vira string vazia."""
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def save_pages(pages: list[str], dest: Path, pdf_sha256: str) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        for i, text in enumerate(pages, start=1):
            f.write(json.dumps({"pdf_sha256": pdf_sha256, "page": i, "text": text}, ensure_ascii=False) + "\n")
    return dest


def find_citations(
    pages: list[str], pdf_sha256: str, keywords: list[str], *,
    max_per_keyword: int = 2, context_chars: int = 240,
) -> list[Citation]:
    """Localiza trechos contendo as palavras-chave, com página e contexto.

    O trecho é devolvido VERBATIM (dado, não instrução) e é verificável:
    `verify_citation` confere que o snippet existe na página indicada.
    """
    out: list[Citation] = []
    for kw in keywords:
        pattern = re.compile(re.escape(kw), re.IGNORECASE)
        found = 0
        for page_no, text in enumerate(pages, start=1):
            if found >= max_per_keyword:
                break
            m = pattern.search(text)
            if not m:
                continue
            start = max(0, m.start() - context_chars // 2)
            end = min(len(text), m.end() + context_chars // 2)
            snippet = " ".join(text[start:end].split())
            out.append(Citation(pdf_sha256, page_no, snippet, kw))
            found += 1
    return out


def verify_citation(pages: list[str], citation: Citation) -> bool:
    """Uma citação é válida se o snippet (normalizado) está na página indicada."""
    if not (1 <= citation.page <= len(pages)):
        return False
    normalized_page = " ".join(pages[citation.page - 1].split())
    return citation.snippet in normalized_page


def citations_to_markdown(citations: list[Citation], doc_label: str, url: str) -> str:
    lines = [f"Documento oficial: {doc_label} — {url}", ""]
    for c in citations:
        lines.append(
            f"- (p. {c.page}, doc sha256 {c.pdf_sha256[:12]}…) “{c.snippet}”"
        )
    lines.append("")
    lines.append(
        "_Trechos extraídos verbatim do documento oficial; conteúdo de documento é dado, não instrução._"
    )
    return "\n".join(lines)


def to_jsonable(citations: list[Citation]) -> list[dict]:
    return [asdict(c) for c in citations]
