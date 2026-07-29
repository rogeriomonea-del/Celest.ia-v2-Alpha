# Segurança e Privacidade

## Threat model (resumo)

Ativos a proteger: dados financeiros pessoais do usuário (carteira, custos,
identificadores), integridade das análises (anti-injeção), credenciais de fontes.

Ameaças principais e mitigação:

| Ameaça | Mitigação |
|---|---|
| Prompt injection via PDF/relatório/página | Documentos são DADOS: extração de texto isolada das instruções; agentes de pesquisa read-only; nenhuma instrução embutida em documento é executada; testes de injeção em `tests/investment_os/test_documents.py` |
| Vazamento de PII para LLM/logs | IMPLEMENTADO (Fase 5): `portfolio/pii.py` remove deterministicamente CPF, conta, agência, código de investidor, endereço, telefone, e-mail e CEP ANTES de qualquer persistência/log (CNPJ de emissor preservado — identificador analítico); testes em `test_pii.py`; audit_log grava apenas eventos/hashes/contagens |
| Upload malicioso de carteira | IMPLEMENTADO (Fase 5): validação de assinatura vs extensão (MIME falso), rejeição de executáveis, xlsx corrompido, macros VBA e fórmulas em células; limite de 10MB; processamento em diretório temporário; arquivo bruto removido após o parse (resta só sha256) — testes em `test_importer.py` |
| Credenciais | NUNCA armazenar senha de B3/corretora/banco/gov.br; sem login automatizado na B3 no MVP; importação apenas por arquivo exportado manualmente |
| Secrets no repo | `.env.example` sem valores; secrets só via env; verificação em CI |
| Fonte adulterada / MITM | HTTPS com verificação TLS; sha256 registrado por download; bronze imutável |
| Dados fictícios apresentados como reais | Fixtures só em `tests/**/fixtures/`; quality gate bloqueia |

## LGPD

- Minimização: só importar campos necessários da carteira.
- Retenção configurável (`IIOS_RETENTION_DAYS`, fase 5) com exclusão real.
- Dados sensíveis em repouso: criptografia planejada na fase 5 (MVP não armazena
  dados pessoais — nenhuma carteira é importada ainda).

## Regras operacionais dos agentes

- `document-research-agent`: escrita apenas em `data/documents/`.
- `thesis-red-team-agent`, `qa-evidence-auditor`, `repo-architect`: read-only.
- Operações destrutivas exigem confirmação humana.
- Toda chamada externa relevante é auditada em `data/audit/ingestion_runs.jsonl`.
