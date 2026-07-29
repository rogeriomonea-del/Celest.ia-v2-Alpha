-- Fase 5: perfil, política de investimentos, carteira, importação e rebalanceamento.
-- Regras: snapshots e versões NUNCA são sobrescritos; dados pessoais ficam em
-- data/ (gitignored); audit_log só recebe conteúdo sanitizado.

CREATE TABLE investor_profile (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    alias TEXT NOT NULL DEFAULT 'investidor'
);

CREATE TABLE profile_assessment (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES investor_profile(id),
    created_at TEXT NOT NULL,
    answers_json TEXT NOT NULL,          -- respostas do questionário (sem PII)
    dimension_scores_json TEXT NOT NULL, -- score 0-100 por dimensão, nunca um rótulo único
    conflicts_json TEXT NOT NULL,        -- respostas incompatíveis detectadas
    confidence TEXT NOT NULL             -- BAIXA | MEDIA | ALTA
);

CREATE TABLE investment_goal (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES investor_profile(id),
    created_at TEXT NOT NULL,
    name TEXT NOT NULL,
    horizon_years REAL NOT NULL,
    currency TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE investment_policy (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES investor_profile(id),
    created_at TEXT NOT NULL
);

CREATE TABLE policy_version (
    id INTEGER PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES investment_policy(id),
    version INTEGER NOT NULL,
    prev_version INTEGER,                -- versão anterior (auditoria de mudança)
    created_at TEXT NOT NULL,
    author TEXT NOT NULL,
    reason TEXT NOT NULL,                -- motivo da mudança
    content_json TEXT NOT NULL,          -- IPS completa (faixas, limites, bandas...)
    status TEXT NOT NULL DEFAULT 'draft',-- draft | confirmed | superseded
    confirmed_at TEXT,
    UNIQUE (policy_id, version)
);

CREATE TABLE policy_constraint (
    id INTEGER PRIMARY KEY,
    policy_version_id INTEGER NOT NULL REFERENCES policy_version(id),
    kind TEXT NOT NULL,                  -- class_band | asset_limit | issuer_limit |
                                         -- sector_limit | country_limit | currency_limit |
                                         -- crypto_limit | illiquid_limit
    key TEXT NOT NULL,                   -- ex.: 'acoes_br', 'fii', '*' (qualquer)
    min_pct REAL,
    max_pct REAL
);

CREATE TABLE portfolio (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES investor_profile(id),
    created_at TEXT NOT NULL,
    name TEXT NOT NULL,
    base_currency TEXT NOT NULL DEFAULT 'BRL'
);

CREATE TABLE portfolio_import (
    id INTEGER PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
    created_at TEXT NOT NULL,
    file_sha256 TEXT NOT NULL,           -- só hash: o bruto nunca é persistido no repo
    file_bytes INTEGER NOT NULL,
    file_kind TEXT NOT NULL,             -- xlsx | csv
    adapter TEXT NOT NULL,               -- adaptador + versão (ex.: b3_consolidado_xlsx_v1)
    status TEXT NOT NULL,                -- previewed | confirmed | rejected | failed
    data_base TEXT,                      -- data-base declarada da carteira
    pii_removed_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE TABLE portfolio_import_row (
    id INTEGER PRIMARY KEY,
    import_id INTEGER NOT NULL REFERENCES portfolio_import(id),
    row_index INTEGER NOT NULL,
    parsed_json TEXT NOT NULL,           -- campos já sanitizados/normalizados
    status TEXT NOT NULL,                -- ok | ambiguous | unknown | rejected | duplicate
    reason TEXT NOT NULL DEFAULT '',
    resolution_confidence TEXT NOT NULL DEFAULT 'BAIXA'  -- BAIXA | MEDIA | ALTA
);

CREATE TABLE instrument_resolution (
    id INTEGER PRIMARY KEY,
    import_row_id INTEGER NOT NULL REFERENCES portfolio_import_row(id),
    ticker TEXT,
    cd_cvm TEXT,
    cnpj TEXT,
    isin TEXT,
    classe TEXT,
    asset_class TEXT,                    -- acao_br | fii | bdr | etf | renda_fixa | outro
    method TEXT NOT NULL,                -- fca_listing | user_override | unresolved
    confidence TEXT NOT NULL,
    resolved_by TEXT NOT NULL            -- system | user
);

CREATE TABLE portfolio_snapshot (
    id INTEGER PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
    import_id INTEGER REFERENCES portfolio_import(id),
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    data_base TEXT,                      -- data-base da carteira (≠ data de importação e ≠ data dos preços)
    content_sha256 TEXT NOT NULL,        -- hash do conteúdo normalizado (idempotência)
    UNIQUE (portfolio_id, version)
);

CREATE TABLE position (
    id INTEGER PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES portfolio_snapshot(id),
    ticker TEXT,
    cd_cvm TEXT,
    cnpj TEXT,
    isin TEXT,
    classe TEXT,
    asset_class TEXT NOT NULL,
    quantity REAL NOT NULL,
    avg_cost REAL,                       -- NULL = desconhecido (NUNCA zero)
    cost_status TEXT NOT NULL,           -- conhecido | desconhecido | parcial
    currency TEXT NOT NULL DEFAULT 'BRL',
    source TEXT NOT NULL                 -- import:<id> | manual
);

CREATE TABLE position_source (
    id INTEGER PRIMARY KEY,
    position_id INTEGER NOT NULL REFERENCES position(id),
    import_row_id INTEGER REFERENCES portfolio_import_row(id),
    kind TEXT NOT NULL                   -- import_row | manual_entry
);

CREATE TABLE rebalance_plan (
    id INTEGER PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES portfolio_snapshot(id),
    policy_version_id INTEGER NOT NULL REFERENCES policy_version(id),
    created_at TEXT NOT NULL,
    params_json TEXT NOT NULL,           -- aporte mensal, meses, premissas
    plan_json TEXT NOT NULL,             -- resultado completo (antes/depois, vendas evitadas...)
    confidence TEXT NOT NULL
);

CREATE TABLE rebalance_action (
    id INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES rebalance_plan(id),
    seq INTEGER NOT NULL,
    scope TEXT NOT NULL,                 -- class | asset
    key TEXT NOT NULL,
    current_pct REAL,
    target_min_pct REAL,
    target_max_pct REAL,
    action TEXT NOT NULL,                -- estados permitidos (manter, aumentar_com_aportes, ...)
    amount_brl REAL,
    priority INTEGER NOT NULL,
    rationale TEXT NOT NULL
);

CREATE TABLE contribution_plan (
    id INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES rebalance_plan(id),
    month_offset INTEGER NOT NULL,       -- 1..6
    allocations_json TEXT NOT NULL
);

CREATE TABLE data_quality_issue (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    scope TEXT NOT NULL,                 -- import | snapshot | analysis | rebalance
    ref_id INTEGER,
    severity TEXT NOT NULL,              -- critica | alta | media | baixa
    description TEXT NOT NULL            -- sem PII e sem valores financeiros pessoais
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    event TEXT NOT NULL,
    details_json TEXT NOT NULL           -- SANITIZADO: hashes/contagens, nunca conteúdo pessoal
);
