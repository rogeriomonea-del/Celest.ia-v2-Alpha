"""Remoção determinística de PII — independente de LLM, testada.

Aplicada a TODO texto extraído de arquivos de carteira ANTES de qualquer
persistência, log ou (futuro) processamento por LLM. CNPJ de emissor NÃO é
tratado como PII (necessário analiticamente para resolução de instrumentos).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("cpf", re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")),
    # CPF sem máscara: 11 dígitos isolados (CNPJ tem 14 e não casa aqui)
    ("cpf", re.compile(r"(?<![\d./-])\d{11}(?![\d./-])")),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("telefone", re.compile(r"(?:\+55\s?)?(?:\(\d{2}\)\s?)\d{4,5}[- ]\d{4}\b")),
    ("telefone", re.compile(r"\+55\s?\d{2}\s?\d{4,5}[- ]?\d{4}\b")),
    # DDD sem parênteses (ex.: 11 91234-5678); exige hífen p/ evitar falsos positivos
    ("telefone", re.compile(r"\b\d{2}\s\d{4,5}-\d{4}\b")),
    ("cep", re.compile(r"\b\d{5}-\d{3}\b")),
    ("agencia", re.compile(r"(?i)\bag[êe]ncia\b[:\s]*[\d-]+")),
    ("conta", re.compile(r"(?i)\bconta(?:\s+corrente)?\b[:\s]*[\d.-]+")),
    ("codigo_investidor", re.compile(r"(?i)\bc[óo]digo\s+(?:de\s+)?investidor\b[:\s]*[\d.-]+")),
    ("endereco", re.compile(
        r"(?im)^\s*(?:rua|av\.?|avenida|alameda|travessa|rodovia|estrada|pra[çc]a)\b[^\n;,]{3,80}(?:,?\s*n?[ºo°.]?\s*\d+)?"
    )),
]


@dataclass
class ScrubResult:
    text: str
    removed_count: int
    kinds: dict[str, int] = field(default_factory=dict)


def scrub_text(text: str) -> ScrubResult:
    """Substitui PII por marcadores [<TIPO> REMOVIDO]. Determinístico."""
    removed: dict[str, int] = {}
    out = text
    for kind, pattern in _PATTERNS:
        out, n = pattern.subn(f"[{kind.upper()} REMOVIDO]", out)
        if n:
            removed[kind] = removed.get(kind, 0) + n
    return ScrubResult(out, sum(removed.values()), removed)


def scrub_value(value) -> tuple[str, int]:
    """Sanitiza um valor de célula (não numérico) de planilha/CSV."""
    if value is None:
        return "", 0
    s = str(value)
    r = scrub_text(s)
    return r.text, r.removed_count


def contains_pii(text: str) -> bool:
    return any(p.search(text) for _, p in _PATTERNS)
