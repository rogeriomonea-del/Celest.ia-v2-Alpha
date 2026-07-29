# Investment Intelligence OS — Ativo 360: AZZA3 (AZZAS 2154 S.A.)

- Código CVM: 22349 | Setor (cadastro CVM): Têxtil e Vestuário
- Última demonstração disponível: **2026-03-31** (recebida pela CVM em 2026-05-07) — detectada dinamicamente, nunca fixada.
- Status no screener: **QUASE_APROVADA**

## Indicadores (todos com fonte, data-base e status)

| Métrica | Valor | Fonte | Data-base |
|---|---|---|---|
| Preço (fechamento, NÃO ajustado) | data 2026-07-27 | B3 COTAHIST | 2026-07-27 |
| Valor de mercado | R$ 3.5 bi | B3 + CVM composição de capital | 2026-07-27 |
| P/L (LTM) | 4.15 | CVM DFP/ITR + B3 | 2026-03-31 |
| P/VPA | 0.43 | CVM DFP/ITR + B3 | 2026-03-31 |
| ROE LTM | 10.41% | CVM DFP/ITR | 2026-03-31 |
| ROE mediano 5a | 12.99% | CVM DFP | 2026-03-31 |
| Dívida líq./EBITDA (proxy) | 1.28 | CVM DFP/ITR | 2026-03-31 |
| CAGR receita 5a | 41.80% a.a. | CVM DFP | 2026-03-31 |
| CAGR lucro 5a | 27.46% a.a. | CVM DFP | 2026-03-31 |
| Conversão de caixa (CFO/lucro) | 1.40 | CVM DFP/ITR | 2026-03-31 |
| Liquidez média 63 pregões | R$ 49.2M/dia | B3 COTAHIST | 2026-07-27 |
| Dividend yield | indisponível (eventos corporativos não ingeridos no MVP) | — | — |

## Avaliação pelos critérios do preset

| Critério | Resultado | Detalhe |
|---|---|---|
| P/VPA < 1 | PASS | 0.43x |
| P/L positivo e baixo | FAIL | 4.15x vs P35 do setor 3.89x (7 pares) |
| ROE mediano 5a > 12% | PASS | 12.99% |
| Dívida líq./EBITDA < 3 | PASS | 1.28x |
| CAGR receita > 10% | PASS | 41.80% a.a. |
| CAGR lucro > 10% | PASS | 27.46% a.a. |
| Receita estável (sem queda >15%) | PASS | pior variação anual 14.5% |
| Lucro positivo nos 5 anos | PASS | exercícios 2021–2025 |
| CFO positivo em >=4 dos 5 anos | PASS | 5/5 anos positivos |
| FCF positivo em >=3 dos 5 anos | PASS | 3/5 anos positivos (FCF proxy = CFO - CAPEX) |
| Liquidez >= R$5M/dia | PASS | R$ 49.2M/dia (média 63 pregões) |

## Séries (R$ milhões — CVM DFP/ITR consolidado, as reported)

| Exercício | Receita | Lucro atribuível |
|---|---|---|
| 2021 | 2,924 | 345 |
| 2022 | 4,234 | 425 |
| 2023 | 4,847 | 399 |
| 2024 | 8,380 | 342 |
| 2025 | 11,819 | 911 |

| Trimestre isolado | Receita | Lucro |
|---|---|---|
| 2025T1 | 2,697 | 118 |
| 2025T2 | 2,901 | 538 |
| 2025T3 | 2,958 | 165 |
| 2026T1 | 2,480 | 39 |

Comparação histórica com 3T25: receita 2026T1 = 2,480 vs 3T25 = 2,958 (-16.2%). Trimestres de estações diferentes: sazonalidade pode explicar parte da variação.

## Análise documental (último documento oficial)

Análise documental não executada para este ativo nesta rodada.

## Limitações e classificação de evidência

- FATO VERIFICADO: demonstrações CVM e preços B3 (com hash de ingestão).
- INFERÊNCIA DO SISTEMA: indicadores derivados (fórmulas testadas em `investment_os/engine/`).
- DADO AUSENTE: dividend yield, retorno total ajustado, ressalvas de auditoria, free float, WACC.
- Preços B3 não ajustados por proventos; nada aqui é retorno total.
- Este relatório é apoio à pesquisa. NÃO é recomendação de compra ou venda.