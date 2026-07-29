# Investment Intelligence OS — Ativo 360: VALE3 (VALE S.A.)

- Código CVM: 4170 | Setor (cadastro CVM): Extração Mineral
- Última demonstração disponível: **2026-03-31** (recebida pela CVM em 2026-04-28) — detectada dinamicamente, nunca fixada.
- Status no screener: **REPROVADA**

## Indicadores (todos com fonte, data-base e status)

| Métrica | Valor | Fonte | Data-base |
|---|---|---|---|
| Preço (fechamento, NÃO ajustado) | data 2026-07-27 | B3 COTAHIST | 2026-07-27 |
| Valor de mercado | R$ 309.4 bi | B3 + CVM composição de capital | 2026-07-27 |
| P/L (LTM) | 19.83 | CVM DFP/ITR + B3 | 2026-03-31 |
| P/VPA | 1.62 | CVM DFP/ITR + B3 | 2026-03-31 |
| ROE LTM | 8.31% | CVM DFP/ITR | 2026-03-31 |
| ROE mediano 5a | 18.51% | CVM DFP | 2026-03-31 |
| Dívida líq./EBITDA (proxy) | 1.39 | CVM DFP/ITR | 2026-03-31 |
| CAGR receita 5a | -7.64% a.a. | CVM DFP | 2026-03-31 |
| CAGR lucro 5a | -41.90% a.a. | CVM DFP | 2026-03-31 |
| Conversão de caixa (CFO/lucro) | 3.13 | CVM DFP/ITR | 2026-03-31 |
| Liquidez média 63 pregões | R$ 1417.6M/dia | B3 COTAHIST | 2026-07-27 |
| Dividend yield | indisponível (eventos corporativos não ingeridos no MVP) | — | — |

## Avaliação pelos critérios do preset

| Critério | Resultado | Detalhe |
|---|---|---|
| P/VPA < 1 | FAIL | 1.62x |
| P/L positivo e baixo | FAIL | 19.83x vs limite absoluto 12x (setor com 2 pares < 5: percentil indisponível — limitação declarada) |
| ROE mediano 5a > 12% | PASS | 18.51% |
| Dívida líq./EBITDA < 3 | PASS | 1.39x |
| CAGR receita > 10% | FAIL | -7.64% a.a. |
| CAGR lucro > 10% | FAIL | -41.90% a.a. |
| Receita estável (sem queda >15%) | FAIL | pior variação anual -22.8% |
| Lucro positivo nos 5 anos | PASS | exercícios 2021–2025 |
| CFO positivo em >=4 dos 5 anos | PASS | 5/5 anos positivos |
| FCF positivo em >=3 dos 5 anos | PASS | 5/5 anos positivos (FCF proxy = CFO - CAPEX) |
| Liquidez >= R$5M/dia | PASS | R$ 1417.6M/dia (média 63 pregões) |

## Séries (R$ milhões — CVM DFP/ITR consolidado, as reported)

| Exercício | Receita | Lucro atribuível |
|---|---|---|
| 2021 | 293,524 | 121,228 |
| 2022 | 226,508 | 95,924 |
| 2023 | 208,066 | 39,940 |
| 2024 | 206,005 | 31,592 |
| 2025 | 213,595 | 13,814 |

| Trimestre isolado | Receita | Lucro |
|---|---|---|
| 2025T1 | 47,411 | 8,164 |
| 2025T2 | 49,807 | 12,081 |
| 2025T3 | 56,701 | 14,617 |
| 2026T1 | 48,680 | 9,953 |

Comparação histórica com 3T25: receita 2026T1 = 48,680 vs 3T25 = 56,701 (-14.1%). Trimestres de estações diferentes: sazonalidade pode explicar parte da variação.

## Análise documental (último documento oficial)

Análise documental não executada para este ativo nesta rodada.

## Limitações e classificação de evidência

- FATO VERIFICADO: demonstrações CVM e preços B3 (com hash de ingestão).
- INFERÊNCIA DO SISTEMA: indicadores derivados (fórmulas testadas em `investment_os/engine/`).
- DADO AUSENTE: dividend yield, retorno total ajustado, ressalvas de auditoria, free float, WACC.
- Preços B3 não ajustados por proventos; nada aqui é retorno total.
- Este relatório é apoio à pesquisa. NÃO é recomendação de compra ou venda.