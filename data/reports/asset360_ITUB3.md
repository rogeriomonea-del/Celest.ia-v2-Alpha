# Investment Intelligence OS — Ativo 360: ITUB3,ITUB4 (ITAU UNIBANCO HOLDING S.A.)

- Código CVM: 19348 | Setor (cadastro CVM): Bancos
- Última demonstração disponível: **2026-03-31** (recebida pela CVM em 2026-05-05) — detectada dinamicamente, nunca fixada.
- Status no screener: **QUASE_APROVADA**

## Indicadores (todos com fonte, data-base e status)

| Métrica | Valor | Fonte | Data-base |
|---|---|---|---|
| Preço (fechamento, NÃO ajustado) | data 2026-07-27 | B3 COTAHIST | 2026-07-27 |
| Valor de mercado | R$ 485.0 bi | B3 + CVM composição de capital | 2026-07-27 |
| P/L (LTM) | 10.55 | CVM DFP/ITR + B3 | 2026-03-31 |
| P/VPA | 2.31 | CVM DFP/ITR + B3 | 2026-03-31 |
| ROE LTM | 22.20% | CVM DFP/ITR | 2026-03-31 |
| ROE mediano 5a | 19.50% | CVM DFP | 2026-03-31 |
| Dívida líq./EBITDA (proxy) | nao_aplicavel | CVM DFP/ITR | 2026-03-31 |
| CAGR receita 5a | 18.60% a.a. | CVM DFP | 2026-03-31 |
| CAGR lucro 5a | 13.79% a.a. | CVM DFP | 2026-03-31 |
| Conversão de caixa (CFO/lucro) | 2.21 | CVM DFP/ITR | 2026-03-31 |
| Liquidez média 63 pregões | R$ 1129.4M/dia | B3 COTAHIST | 2026-07-27 |
| Dividend yield | indisponível (eventos corporativos não ingeridos no MVP) | — | — |

## Avaliação pelos critérios do preset

| Critério | Resultado | Detalhe |
|---|---|---|
| P/VPA < 1 | FAIL | 2.31x |
| P/L positivo e baixo | PASS | 10.55x vs limite absoluto 12x (setor com 1 pares < 5: percentil indisponível — limitação declarada) |
| ROE mediano 5a > 12% | PASS | 19.50% |
| Dívida líq./EBITDA < 3 | NOT_EVALUATED | instituição financeira — critério substituído na fase setorial |
| CAGR receita > 10% | PASS | 18.60% a.a. |
| CAGR lucro > 10% | PASS | 13.79% a.a. |
| Receita estável (sem queda >15%) | PASS | pior variação anual 7.1% |
| Lucro positivo nos 5 anos | PASS | exercícios 2021–2025 |
| CFO positivo em >=4 dos 5 anos | NOT_EVALUATED | instituição financeira — DFC não comparável |
| FCF positivo em >=3 dos 5 anos | NOT_EVALUATED | instituição financeira |
| Liquidez >= R$5M/dia | PASS | R$ 1129.4M/dia (média 63 pregões) |

## Séries (R$ milhões — CVM DFP/ITR consolidado, as reported)

| Exercício | Receita | Lucro atribuível |
|---|---|---|
| 2021 | 195,679 | 26,760 |
| 2022 | 283,372 | 29,702 |
| 2023 | 313,221 | 33,105 |
| 2024 | 335,328 | 41,085 |
| 2025 | 387,118 | 44,857 |

| Trimestre isolado | Receita | Lucro |
|---|---|---|
| 2025T1 | 97,490 | 10,507 |
| 2025T2 | 102,761 | 11,137 |
| 2025T3 | 97,389 | 11,306 |
| 2026T1 | 99,045 | 11,636 |

Comparação histórica com 3T25: receita 2026T1 = 99,045 vs 3T25 = 97,389 (+1.7%). Trimestres de estações diferentes: sazonalidade pode explicar parte da variação.

## Análise documental (último documento oficial)

Análise documental não executada para este ativo nesta rodada.

## Limitações e classificação de evidência

- FATO VERIFICADO: demonstrações CVM e preços B3 (com hash de ingestão).
- INFERÊNCIA DO SISTEMA: indicadores derivados (fórmulas testadas em `investment_os/engine/`).
- DADO AUSENTE: dividend yield, retorno total ajustado, ressalvas de auditoria, free float, WACC.
- Preços B3 não ajustados por proventos; nada aqui é retorno total.
- Este relatório é apoio à pesquisa. NÃO é recomendação de compra ou venda.