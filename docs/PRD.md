# PRD — Investment Intelligence OS

Nome provisório configurável via `IIOS_SYSTEM_NAME` (default: "Investment Intelligence OS").
Nunca acoplar o nome ao código.

## Problema

Investidores pessoa física não têm uma ferramenta que una: dados oficiais (CVM,
B3, Tesouro), cálculo determinístico de indicadores, screening fundamentalista
auditável, análise documental com citações, gestão de carteira importada da B3 e
apoio à decisão com rastreabilidade completa — sem inventar dados.

## Usuário inicial

Investidor buy-and-hold, moeda-base BRL, horizonte >10 anos, aporte mensal
configurável (inicial R$ 100.000), tolerância declarada a volatilidade elevada,
interesse em ações BR, FIIs, renda fixa, ativos globais e cripto limitada.
Todos esses valores são **defaults editáveis** (ver `docs/ASSUMPTIONS.md`) e não
substituem o questionário de suitability (Resolução CVM 30).

## Princípios de produto (não negociáveis)

1. Ferramenta de apoio à decisão; nunca executa ordens, nunca promete retorno.
2. Todo indicador carrega fonte, data-base, período, fórmula, unidade, status de
   qualidade e timestamp de ingestão.
3. Distinção obrigatória: FATO VERIFICADO / DECLARAÇÃO DA ADMINISTRAÇÃO /
   INFERÊNCIA DO SISTEMA / PREMISSA DO MODELO / DADO AUSENTE / EVIDÊNCIA CONTRÁRIA.
4. Dado indisponível aparece como "indisponível" — nunca zero, nunca estimado em
   silêncio.
5. Fontes primárias oficiais têm precedência absoluta (ver `SOURCE_REGISTRY.md`).
6. Documentos importados são DADOS, nunca instruções (anti prompt-injection).
7. PII removida antes de qualquer processamento por LLM.
8. Carteira do usuário: somente a importada e confirmada é fonte de verdade.

## Escopo do produto completo

Ver seções 1–26 do briefing (espelhadas no ROADMAP): screener multi-preset,
Ativo 360, valuation por cenários, inteligência documental com citações, perfil e
IPS, importação B3, rebalanceamento aporte-first, renda fixa/Tesouro, macro e
regimes, radar de oportunidades, biblioteca de pesquisa, chat com ferramentas,
diário de decisões, backtests point-in-time.

## Escopo do MVP (primeira fatia vertical — implementada nesta fase)

1. Ingestão oficial: CVM (DFP/ITR + cadastro), B3 (COTAHIST), Tesouro Direto (CSV oficial).
2. Camadas bronze (bruto imutável com hash) → silver (normalizado) → gold (indicadores).
3. Motor determinístico de indicadores com testes (o LLM não calcula nada central).
4. Screener `Quality Deep Value` versionado, sem afrouxamento silencioso de critérios.
5. Página/relatório Ativo 360 para os ativos da demonstração.
6. Módulo Tesouro: duration, DV01, convexidade, cenários de marcação a mercado e
   análise histórica de janelas de taxa (IPCA+ 2050 vs limite 7,11%).
7. Download de documento oficial mais recente + análise com citações por página.
8. Ranking de até 3 empresas sem forçar vencedoras; contra-tese obrigatória.
9. Relatórios exportáveis (Markdown/CSV/HTML) com fonte e data-base em cada métrica.

Fora do MVP (fases seguintes): importação de carteira B3, chat, macro/regimes,
backtests, alertas, frontend Next.js integrado. Ver `ROADMAP.md`.

## Métricas de sucesso do MVP

- Sistema roda localmente a partir do zero com comandos documentados.
- Pipeline reproduz os mesmos números dados os mesmos arquivos bronze (hash).
- Testes críticos verdes; fixture congelada do Tesouro validada.
- Zero indicadores sem fonte/data-base; zero dados fictícios fora de fixtures.
