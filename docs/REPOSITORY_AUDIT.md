# Auditoria do Repositório — Celest.ia-v2-Alpha

Data da auditoria: 2026-07-28.

## O que existe hoje

Este repositório contém, na branch `main`, um produto **não relacionado a finanças**:
uma plataforma de busca de voos ("Celestia Travel"):

| Componente | Stack | Estado |
|---|---|---|
| `scrapers.py` | Python stdlib (urllib) | Scrapers simples de Copa Airlines / ConnectMiles / Skyscanner (frágeis, sem testes de rede) |
| `research_planner.py` | Python stdlib | Planejador de "research" de viagens |
| `celestia_dashboard/` | React 18 + Vite + Tailwind | UI de busca de voos com dados estáticos (`src/data/flights.ts`) |
| `tests/` | pytest-style (unittest compatível) | Testes unitários dos módulos Python de viagens |
| `vercel.json` | — | Deploy do dashboard na Vercel |

Não há: banco de dados, CI, autenticação, ingestão de dados, backend HTTP, ou
qualquer código de análise financeira.

## Decisão de arquitetura para o Investment Intelligence OS

O código de viagens **não é reutilizável** para o domínio financeiro, mas não será
removido (regra: sem alterações destrutivas). O novo sistema é adicionado em
diretórios próprios e independentes:

- `investment_os/` — pacote Python do backend (ingestão, motor financeiro, screener, API);
- `tests/investment_os/` — testes do novo sistema (o diretório `tests/` legado permanece);
- `docs/` — documentação do novo sistema (este diretório);
- `.claude/agents/` — agentes persistentes;
- `data/` — camadas bronze/silver/gold (gitignored, exceto fixtures e artefatos gold pequenos).

Ver `docs/adr/0001-repo-coexistence.md` e `docs/ARCHITECTURE.md`.

## Riscos de regressão identificados

1. `vercel.json` na raiz aponta o deploy para `celestia_dashboard` — não tocar.
2. `tests/` legado importa `scrapers.py`/`research_planner.py` da raiz — novos
   testes ficam em `tests/investment_os/` sem alterar os existentes.
3. Nenhum `requirements.txt` existia; o novo arquivo lista apenas dependências do
   `investment_os` (os módulos de viagem usam somente stdlib, sem impacto).

## Dívida técnica herdada (não bloqueante, registrada)

- Scrapers de voos violam potencialmente termos de uso de terceiros; estão fora do
  escopo do Investment Intelligence OS e não são chamados por ele.
- Ausência de CI. CI mínima para o `investment_os` é introduzida nesta fase.

## Repositório irmão

`Celst.ia-Finance` (Next.js 14 + TS + Tailwind) contém um dashboard financeiro com
dados **simulados** (brapi.dev opcional, Open Finance mock, base fundamentalista
estática em `lib/agents/market-data.ts`). A auditoria dele está em
`docs/REPOSITORY_AUDIT.md` daquele repositório. Papel futuro: frontend oficial do
sistema, consumindo a API do backend deste repositório (ver ROADMAP Fase 3+).
Regra desde já: nenhum dado simulado daquele repo pode ser apresentado como real.
