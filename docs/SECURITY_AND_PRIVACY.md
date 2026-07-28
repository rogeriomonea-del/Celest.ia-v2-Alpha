# Segurança e Privacidade

## Threat model (resumo)

Ativos a proteger: dados financeiros pessoais do usuário (carteira, custos,
identificadores), integridade das análises (anti-injeção), credenciais de fontes.

Ameaças principais e mitigação:

| Ameaça | Mitigação |
|---|---|
| Prompt injection via PDF/relatório/página | Documentos são DADOS: extração de texto isolada das instruções; agentes de pesquisa read-only; nenhuma instrução embutida em documento é executada; testes de injeção em `tests/investment_os/test_documents.py` |
| Vazamento de PII para LLM/logs | Serviço `pii.py` (fase 5) remove CPF, conta, código de investidor, endereço, telefone, e-mail antes de qualquer LLM; logs de aplicação nunca registram conteúdo financeiro pessoal |
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
