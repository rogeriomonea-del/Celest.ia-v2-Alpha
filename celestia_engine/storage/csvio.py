"""Primitivos de I/O CSV compartilhados pela camada de armazenamento.

Duas regras valem para TODOS os CSVs do celest.ia:

* **Append seguro**: o cabeçalho é decidido pela posição real do arquivo
  depois de abrir em append (``tell() == 0``), não por um ``exists()``
  anterior — duas escritas concorrentes não duplicam o header.
* **Leitura tolerante**: ``utf-8-sig`` lê arquivos normais e remove o BOM
  quando alguém salvou o CSV pelo Excel; CSV corrompido nunca derruba a
  busca (o chamador trata as exceções listadas em ``READ_ERRORS``).
"""

from __future__ import annotations

import csv
from pathlib import Path

#: exceções que os leitores best-effort devem engolir
READ_ERRORS = (OSError, csv.Error, UnicodeDecodeError)


def append_rows(path: Path, fields: list[str], rows: list[dict]) -> None:
    """Append com header seguro contra corrida. Levanta OSError se o disco
    falhar — quem chama decide se é best-effort."""
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, restval="")
        if handle.tell() == 0:
            writer.writeheader()
        writer.writerows(rows)


def read_rows(path: Path):
    """Itera DictRows de um CSV; use dentro de try com READ_ERRORS."""
    with path.open(newline="", encoding="utf-8-sig") as handle:
        yield from csv.DictReader(handle)
