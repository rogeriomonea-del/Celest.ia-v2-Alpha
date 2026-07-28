# ADR-0002 — Armazenamento do MVP: DuckDB/parquet em vez de PostgreSQL

Data: 2026-07-28. Status: aceita (revisar na Fase 5).

## Contexto
A arquitetura-alvo prescreve PostgreSQL + pgvector + S3. O ambiente do MVP não
possui servidor de banco provisionado, e a primeira fatia vertical é analítica e
single-user, sem dados pessoais persistidos.

## Decisão
- Bronze: arquivos brutos imutáveis + sidecar `.meta.json` (hash, URL, datas).
- Silver/Gold: parquet + DuckDB (consultas analíticas); CSV para artefatos.
- Auditoria: JSONL append-only.
- O acesso a dados fica isolado em módulos (`silver/`, `ingestion/base.py`),
  permitindo trocar o backend de armazenamento sem alterar `engine/`.

## Consequências
- Setup local sem dependências de infraestrutura; reprodutibilidade por hash.
- Migração para Postgres/pgvector necessária antes de: múltiplos usuários,
  RAG documental em escala, dados pessoais (carteira) — planejada na Fase 5.
