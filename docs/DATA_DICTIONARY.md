# Dicionário de Dados

Entidades do modelo canônico. No MVP, materializadas como parquet/CSV em
`data/silver` e `data/gold` (DuckDB para consulta); alvo PostgreSQL (ADR-0002).
Colunas de rastreabilidade obrigatórias em TODA tabela silver/gold:
`source_id`, `source_url`, `ingested_at`, `data_base` (data-base do dado).

## issuer (emissor)
- `cd_cvm` (PK), `cnpj`, `razao_social`, `setor_ativ` (CVM), `situacao`, `dt_reg`.
- Fonte: cad_cia_aberta.csv.

## security / listing
- `ticker` (código de negociação B3), `cd_cvm` (FK), `classe` (ON/PN/UNIT),
  `especificacao`, `mercado`, `moeda`. Ticker NÃO é PK global — chave é
  (`ticker`, `data`) nas séries e `cd_cvm` no emissor.

## market_price
- (`ticker`, `trade_date`) PK, `open`, `high`, `low`, `close`, `volume_fin`,
  `trades`, `fator_cotacao`, `cd_bdi`, `tp_merc`.
- Fonte: COTAHIST. NÃO ajustado por proventos (flag `adjusted=false`).

## statement_period / financial_fact
- `cd_cvm`, `grupo_dfp` (BPA/BPP/DRE/DFC_MI/DVA...), `cd_conta`, `ds_conta`,
  `vl_conta` (em R$, convertido de ESCALA_MOEDA), `consolidado` (bool),
  `dt_refer`, `dt_ini_exerc`, `dt_fim_exerc`, `ordem_exerc` (ÚLTIMO/PENÚLTIMO),
  `versao` (reapresentação), `dt_receb` (data de conhecimento público),
  `doc_type` (DFP/ITR).
- Reapresentação: versões anteriores preservadas em bronze; silver marca
  `is_latest_version`.

## fixed_income_instrument / td_rate
- Instrumento: (`tipo_titulo`, `dt_vencimento`) PK lógica.
- Taxa: + `data_base`, `taxa_compra_manha`, `taxa_venda_manha`, `pu_compra`,
  `pu_venda`, `pu_base`. Percentuais a.a.; PU em R$.
- Fonte: Tesouro Transparente CSV.

## source / ingestion_run
- `source_id`, `url`, `sha256`, `bytes`, `http_status`, `started_at`,
  `finished_at`, `status`, `error`. Append-only em
  `data/audit/ingestion_runs.jsonl`.

## document
- `cd_cvm`, `doc_id`, `categoria`, `tipo`, `dt_entrega`, `dt_referencia`,
  `url_download`, `sha256`, `bytes`, `pages`, `downloaded_at`, `versao`.
- Fonte: CVM IPE / sistema de documentos.

## document_page / citation
- `sha256_doc`, `page_number`, `text`; citação = (`sha256_doc`, `page`, trecho).
  Toda citação em relatório deve ser verificável contra o texto extraído.

## metric_value (gold)
- `entity_id` (cd_cvm ou instrumento), `metric_id`, `value` (nullable),
  `status` (OK/PREJUIZO/NAO_APLICAVEL/...), `unit`, `period`, `formula_version`,
  `inputs_hash`, `source_ids`, `data_base`, `computed_at`.

## Entidades planejadas (fases seguintes, ainda sem implementação)
corporate_action, dividend, yield_curve, macro_series, valuation_model, scenario,
thesis(_version), recommendation(_version), investor_profile, investment_policy,
portfolio(_snapshot), position, transaction, tax_lot, alert, data_quality_issue
(hoje: statuses por métrica + audit log), share_class detalhada, fund (FII),
sector_taxonomy B3.

## Datas — convenção
- `ref_period_*`: competência contábil.
- `dt_receb`/`dt_entrega`: quando o mercado passou a conhecer (point-in-time).
- `data_base`: data do valor de mercado/taxa.
- `ingested_at`: quando o sistema baixou.
Backtests: somente dados com `dt_receb <= data_simulada`.
