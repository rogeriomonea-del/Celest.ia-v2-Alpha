# Arquitetura — Investment Intelligence OS

## Visão geral

Monorepo com dois repositórios cooperantes:

- **Celest.ia-v2-Alpha** (este): backend Python — ingestão, normalização, motor
  financeiro determinístico, screener, relatórios e API FastAPI.
- **Celst.ia-Finance**: frontend Next.js 14 (App Router) — consumirá a API nas
  fases seguintes; hoje contém protótipo com dados simulados que NÃO podem ser
  apresentados como reais.

## Backend (`investment_os/`)

```
investment_os/
├── config.py              # nomes, paths, env (IIOS_*); nome do sistema desacoplado
├── registry/
│   └── sources.py         # registro tipado de fontes oficiais (espelha SOURCE_REGISTRY.md)
├── ingestion/
│   ├── base.py            # download bronze: hash sha256, ingestion_run, auditoria JSONL
│   ├── tesouro.py         # CSV oficial Tesouro Transparente
│   ├── cvm.py             # DFP/ITR/cadastro (dados.cvm.gov.br)
│   └── b3.py              # COTAHIST (série histórica oficial B3)
├── silver/
│   ├── tesouro.py         # tipagem, datas ISO, decimal ponto, dedup
│   ├── statements.py      # DFP/ITR → financial_facts normalizados (con/ind, últimos/penúltimos)
│   └── quotes.py          # COTAHIST parse posicional → parquet por pregão
├── engine/                # SOMENTE funções puras, tipadas e testadas
│   ├── periods.py         # períodos, TTM, trimestre isolado a partir de acumulado
│   ├── metrics.py         # P/L, P/VPA, ROE, ROIC, margens, dívida, CAGR c/ regras
│   ├── fixed_income.py    # duration, modified duration, DV01, convexidade, MTM
│   └── windows.py         # janelas de taxa (contagem, duração, percentil, hysteresis)
├── screener/
│   ├── presets.py         # presets versionados (Quality Deep Value v1, ...)
│   └── run.py             # aplica critérios, gera aprovadas + quase aprovadas
├── documents/
│   ├── fetch.py           # download de documento oficial (IPE/DFP) com hash
│   └── cite.py            # extração de texto por página + citações verificáveis
├── reports/
│   ├── asset360.py        # relatório Ativo 360 (Markdown/HTML)
│   ├── screener_report.py # tabela de filtradas (MD/CSV/HTML)
│   └── tesouro_report.py  # análise histórica de janelas + cenários MTM
└── api/
    └── main.py            # FastAPI: /health, /assets, /screener, /tesouro
```

## Camadas de dados (`data/`, gitignored exceto `data/gold` pequeno e fixtures)

- **bronze/**: arquivos brutos exatamente como baixados, imutáveis, com sidecar
  `.meta.json` (url, sha256, bytes, timestamps, fonte). Nunca sobrescritos:
  novo download com hash diferente gera novo arquivo versionado por data.
- **silver/**: parquet/CSV normalizados (identificadores canônicos, datas ISO,
  moeda/unidade explícitas, dedup, `as_reported` preservado).
- **gold/**: indicadores, resultados de screener, relatórios — sempre com
  colunas de fonte, data-base e status de qualidade.

Auditoria de ingestão: `data/audit/ingestion_runs.jsonl` (append-only).

## Persistência

MVP: DuckDB + parquet para analítica; SQLite para metadados quando necessário;
sem servidor de banco. Alvo de produção: PostgreSQL + pgvector (RAG), S3 para
objetos. Ver `docs/adr/0002-storage-mvp.md`. O código de acesso é isolado para
permitir a migração sem tocar no motor financeiro.

## Identificadores canônicos

Chave de emissor: `cd_cvm` (código CVM) + CNPJ. Ticker é atributo de listagem
(`listing`), nunca chave primária. Títulos públicos: tipo + vencimento
(+ indexador). Ver `DATA_DICTIONARY.md`.

## Datas

Todo fato distingue: período de referência (`ref_period_start/end`), data de
encerramento, data de publicação/recebimento (`dt_receb`), data de ingestão
(`ingested_at`). Backtests só podem usar dados com data de publicação anterior à
data simulada (point-in-time). Reapresentações preservam `as_reported`.

## Motor financeiro

O LLM **não calcula** indicadores. Todas as fórmulas vivem em `engine/` como
funções puras com testes. Valores ausentes retornam status explícito
(`NAO_APLICAVEL`, `PREJUIZO`, `DADO_INSUFICIENTE`, `SERIE_NAO_COMPARAVEL`) em vez
de números mágicos ou zeros.

## Frontend (fase futura)

Next.js do repo irmão consome a API. Enquanto a integração não existe, os
artefatos gold (JSON/CSV) são o contrato de dados. Nenhuma tela pode exibir dado
sem fonte + data-base.

## Segurança

Ver `SECURITY_AND_PRIVACY.md`: PII scrubber antes de LLM, documentos tratados
como dados (não instruções), sem credenciais de B3/corretora, secrets só via env.
