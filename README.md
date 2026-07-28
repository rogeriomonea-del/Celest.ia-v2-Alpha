# Investment Intelligence OS (backend)

Sistema pessoal de inteligência financeira e análise de investimentos com dados
**exclusivamente de fontes oficiais** (CVM, B3, Tesouro Nacional), cálculos
determinísticos testados e rastreabilidade completa (fonte, data-base, hash).

> Ferramenta de apoio à decisão e pesquisa. Não executa ordens, não promete
> retornos e não apresenta estimativas como certezas. Nada aqui é recomendação
> de investimento.

O nome do produto é configurável via `IIOS_SYSTEM_NAME` (não acoplado ao código).
O frontend (Next.js) vive no repositório irmão `Celst.ia-Finance`.
Este repositório também contém um projeto legado de viagens, intocado
(ver `README-legacy-travel.md` e `docs/adr/0001-repo-coexistence.md`).

## Início rápido

```bash
pip install -r requirements.txt
cp .env.example .env                      # opcional; sem secrets obrigatórios

python -m investment_os.cli ingest        # bronze: CVM DFP/ITR/FCA, B3 COTAHIST, Tesouro (~250MB)
python -m investment_os.cli build         # silver + gold: normalização, indicadores, screener
python -m investment_os.cli report        # relatórios em data/reports/ (inclui download de docs oficiais)

python -m pytest tests/investment_os -q   # testes (motor financeiro, períodos, janelas, citações)
uvicorn investment_os.api.main:app        # API de leitura (http://127.0.0.1:8000/docs)
```

## O que a primeira fatia vertical entrega

- Ingestão auditada (sha256 + JSONL) de: CVM (DFP 2021–2025, ITR 2025–2026, FCA,
  cadastro), B3 (COTAHIST 2025–2026) e Tesouro Direto (CSV oficial).
- Camadas bronze (imutável) → silver (normalizado, point-in-time, reapresentações)
  → gold (indicadores com status explícito — "indisponível" nunca vira 0).
- Motor determinístico testado: TTM/trimestres isolados, P/L, P/VPA, ROE,
  CAGR com regras de não-comparabilidade, dívida líquida/EBITDA (proxy),
  duration/DV01/convexidade, janelas de taxa com hysteresis.
- Screener `Quality Deep Value` v1 sobre ~450 companhias ativas, sem
  afrouxamento silencioso de critérios (aprovadas + quase aprovadas com o
  critério exato que falhou).
- Ativo 360 (Markdown) para os ativos da demonstração, com análise documental e
  citações por página verificáveis (PDF oficial via CVM/ENET, com hash).
- Módulo Tesouro IPCA+ 2050: análise histórica de janelas vs taxa de referência,
  duration, DV01, convexidade e cenários de marcação a mercado (±50 a ±200 bps).
- Fixture de regressão congelada (24/07/2026) validada com dados reais.

Saídas: `data/reports/*.md|.html`, `data/gold/*.json|.csv`.

## Documentação

| Documento | Conteúdo |
|---|---|
| `docs/PRD.md` | objetivo do produto e princípios não negociáveis |
| `docs/ARCHITECTURE.md` | camadas, módulos, identificadores, datas |
| `docs/SOURCE_REGISTRY.md` | fontes oficiais, licenças, validações, limitações |
| `docs/METRIC_REGISTRY.md` | fórmulas, unidades e regras de status |
| `docs/DATA_DICTIONARY.md` | entidades e colunas de rastreabilidade |
| `docs/SECURITY_AND_PRIVACY.md` | threat model, PII, anti prompt-injection |
| `docs/ASSUMPTIONS.md` | premissas registradas (todas editáveis/documentadas) |
| `docs/ROADMAP.md` | fases 0–8 e status |
| `docs/adr/` | decisões arquiteturais |
| `CLAUDE.md` | regras para agentes e Definition of Done |

## Backup e restauração

- Todo o estado derivado é reproduzível: `data/silver`, `data/gold` e
  `data/reports` podem ser regenerados de `data/bronze` com `build` + `report`.
- Backup mínimo: `data/bronze/` (com os sidecars `.meta.json`) e
  `data/audit/ingestion_runs.jsonl`. Restauração: copiar de volta e rodar
  `python -m investment_os.cli build report`.
- Sem banco de servidor no MVP (ADR-0002); migração para PostgreSQL planejada.

## Limitações conhecidas (registradas, não escondidas)

- Preços B3 não ajustados por proventos → sem retorno total nem dividend yield.
- FIIs: apenas dados de mercado (demonstrações de FII em dataset CVM próprio,
  não integrado — ADR-0003).
- Bancos: sem NIM/Basileia (template COSIF na fase setorial); dívida/EBITDA não
  se aplica.
- WACC/spread ROIC−WACC indisponíveis (sem fonte de curvas/beta integrada).
- Ressalvas de auditor, free float e governança: pendências explícitas do
  screener (fontes não estruturadas ainda não integradas).
- Escala da composição de capital da CVM é inconsistente entre companhias;
  resolvida com validação por LPA — sem validação, valor de mercado fica
  indisponível (nunca um palpite).
