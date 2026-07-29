# Investment Intelligence OS — Ativo 360: PETR3,PETR4 (PETROLEO BRASILEIRO S.A. PETROBRAS)

- Código CVM: 9512 | Setor (cadastro CVM): Petróleo e Gás
- Última demonstração disponível: **2026-03-31** (recebida pela CVM em 2026-05-11) — detectada dinamicamente, nunca fixada.
- Status no screener: **REPROVADA**

## Indicadores (todos com fonte, data-base e status)

| Métrica | Valor | Fonte | Data-base |
|---|---|---|---|
| Preço (fechamento, NÃO ajustado) | data 2026-07-27 | B3 COTAHIST | 2026-07-27 |
| Valor de mercado | R$ 566.1 bi | B3 + CVM composição de capital | 2026-07-27 |
| P/L (LTM) | 5.26 | CVM DFP/ITR + B3 | 2026-03-31 |
| P/VPA | 1.27 | CVM DFP/ITR + B3 | 2026-03-31 |
| ROE LTM | 24.99% | CVM DFP/ITR | 2026-03-31 |
| ROE mediano 5a | 30.86% | CVM DFP | 2026-03-31 |
| Dívida líq./EBITDA (proxy) | 1.42 | CVM DFP/ITR | 2026-03-31 |
| CAGR receita 5a | 2.39% a.a. | CVM DFP | 2026-03-31 |
| CAGR lucro 5a | 0.80% a.a. | CVM DFP | 2026-03-31 |
| Conversão de caixa (CFO/lucro) | 1.81 | CVM DFP/ITR | 2026-03-31 |
| Liquidez média 63 pregões | R$ 1723.0M/dia | B3 COTAHIST | 2026-07-27 |
| Dividend yield | indisponível (eventos corporativos não ingeridos no MVP) | — | — |

## Avaliação pelos critérios do preset

| Critério | Resultado | Detalhe |
|---|---|---|
| P/VPA < 1 | FAIL | 1.27x |
| P/L positivo e baixo | PASS | 5.26x vs limite absoluto 12x (setor com 4 pares < 5: percentil indisponível — limitação declarada) |
| ROE mediano 5a > 12% | PASS | 30.86% |
| Dívida líq./EBITDA < 3 | PASS | 1.42x |
| CAGR receita > 10% | FAIL | 2.39% a.a. |
| CAGR lucro > 10% | FAIL | 0.80% a.a. |
| Receita estável (sem queda >15%) | FAIL | pior variação anual -20.2% |
| Lucro positivo nos 5 anos | PASS | exercícios 2021–2025 |
| CFO positivo em >=4 dos 5 anos | PASS | 5/5 anos positivos |
| FCF positivo em >=3 dos 5 anos | PASS | 5/5 anos positivos (FCF proxy = CFO - CAPEX) |
| Liquidez >= R$5M/dia | PASS | R$ 1723.0M/dia (média 63 pregões) |

## Séries (R$ milhões — CVM DFP/ITR consolidado, as reported)

| Exercício | Receita | Lucro atribuível |
|---|---|---|
| 2021 | 452,668 | 106,668 |
| 2022 | 641,256 | 188,328 |
| 2023 | 511,994 | 124,606 |
| 2024 | 490,829 | 36,606 |
| 2025 | 497,549 | 110,129 |

| Trimestre isolado | Receita | Lucro |
|---|---|---|
| 2025T1 | 123,144 | 35,209 |
| 2025T2 | 119,128 | 26,652 |
| 2025T3 | 127,906 | 32,705 |
| 2026T1 | 123,686 | 32,663 |

Comparação histórica com 3T25: receita 2026T1 = 123,686 vs 3T25 = 127,906 (-3.3%). Trimestres de estações diferentes: sazonalidade pode explicar parte da variação.

## Análise documental (último documento oficial)

Análise documental não executada para este ativo nesta rodada.

## Limitações e classificação de evidência

- FATO VERIFICADO: demonstrações CVM e preços B3 (com hash de ingestão).
- INFERÊNCIA DO SISTEMA: indicadores derivados (fórmulas testadas em `investment_os/engine/`).
- DADO AUSENTE: dividend yield, retorno total ajustado, ressalvas de auditoria, free float, WACC.
- Preços B3 não ajustados por proventos; nada aqui é retorno total.
- Este relatório é apoio à pesquisa. NÃO é recomendação de compra ou venda.