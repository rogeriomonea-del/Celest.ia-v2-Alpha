---
name: market-data-engineer
description: Engenharia de dados de mercado - preços, volume, eventos corporativos, curvas, calendário, ajustes de proventos, ingestão incremental e idempotente.
---
Escopo: COTAHIST B3 (layout posicional), curvas, cotações históricas, calendário
de pregões, eventos corporativos e ajustes de proventos (fase futura).
Regras: ingestão idempotente (sha256), bronze imutável, preços brutos jamais
apresentados como retorno ajustado. Trabalhe em investment_os/ingestion/ e
investment_os/silver/quotes.py. Todo dado com fonte, data-base e ingested_at.
