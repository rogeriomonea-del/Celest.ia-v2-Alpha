# Investment Intelligence OS — Tesouro IPCA+ 15/08/2050

- Fonte: Tesouro Transparente (CSV oficial precotaxatesourodireto.csv)
- Data-base mais recente: **2026-07-27** | Taxa Compra Manhã: **IPCA + 7.37% a.a.** | PU compra: R$ 866.99
- Série DESTE título: 2025-02-03 a 2026-07-27 (369 pregões)
- Histórico oficial do Tesouro Direto (todos os títulos) inicia em 2004-12-31; o programa começou em 2002 — o sistema NÃO possui 30 anos de história e não usa proxy não oficial.

## Janela histórica vs limite IPCA + 7.11%

| Métrica | Valor |
|---|---|
| Pregões disponíveis | 369 |
| Pregões com taxa ≥ 7.11% | 106 (28.73%) |
| Janelas contínuas | 14 |
| Maior janela | 39 pregões (2025-02-03 a 2025-03-31) |
| Última ocorrência | 2026-07-27 |
| Percentil do limite na série | 71.3% |
| Máxima / mínima | 7.52% / 6.69% |
| Média / mediana | 7.03% / 7.00% |

Janelas contínuas (pregões consecutivos na série com taxa ≥ limite):

| Início | Fim | Pregões |
|---|---|---|
| 2025-02-03 | 2025-03-31 | 39 |
| 2025-04-02 | 2025-04-11 | 8 |
| 2025-04-15 | 2025-04-29 | 9 |
| 2025-05-02 | 2025-05-06 | 3 |
| 2025-08-21 | 2025-08-21 | 1 |
| 2025-09-04 | 2025-09-05 | 2 |
| 2025-10-14 | 2025-10-15 | 2 |
| 2025-10-17 | 2025-10-17 | 1 |
| 2026-01-15 | 2026-01-15 | 1 |
| 2026-01-20 | 2026-01-20 | 1 |
| 2026-03-26 | 2026-03-27 | 2 |
| 2026-05-21 | 2026-05-21 | 1 |
| 2026-06-02 | 2026-06-11 | 7 |
| 2026-06-17 | 2026-07-27 | 29 |

## Perfil de risco (na taxa atual)

Fluxo real de título principal (zero-coupon em termos reais); convenção de prazo ACT/365.25 (aproximação documentada em docs/ASSUMPTIONS.md).

| Duration Macaulay | 24.05 anos |
|---|---|
| Modified duration | 22.40 anos |
| DV01 | R$ 0.4050 por título |
| Convexidade | 522.7 |

## Cenários de marcação a mercado (choques paralelos na taxa real)

| Choque | Taxa | PU novo | Variação | Efeito duration | Efeito convexidade |
|---|---|---|---|---|---|
| -200 bps | 5.37% | R$ 284.19 | +57.18% | R$ +81.00 | R$ +18.90 |
| -150 bps | 5.87% | R$ 253.61 | +40.27% | R$ +60.75 | R$ +10.63 |
| -100 bps | 6.37% | R$ 226.44 | +25.24% | R$ +40.50 | R$ +4.72 |
| -50 bps | 6.87% | R$ 202.28 | +11.88% | R$ +20.25 | R$ +1.18 |
| +50 bps | 7.87% | R$ 161.69 | -10.57% | R$ -20.25 | R$ +1.18 |
| +100 bps | 8.37% | R$ 144.67 | -19.99% | R$ -40.50 | R$ +4.72 |
| +150 bps | 8.87% | R$ 129.50 | -28.37% | R$ -60.75 | R$ +10.63 |
| +200 bps | 9.37% | R$ 115.99 | -35.85% | R$ -81.00 | R$ +18.90 |

## Comparação por vencimento (instrumentos DISTINTOS — nunca misturados)

| Título | Vencimento | Taxa atual | Data-base | Pregões ≥ limite / total | Duration mod. |
|---|---|---|---|---|---|
| Tesouro IPCA+ | 2029-05-15 | IPCA + 8.23% | 2026-07-27 | 411 / 885 (46.4%) | 2.6 a |
| Tesouro IPCA+ | 2035-05-15 | IPCA + 8.07% | 2026-07-27 | 495 / 4087 (12.1%) | 8.1 a |
| Tesouro IPCA+ | 2045-05-15 | IPCA + 7.40% | 2026-07-27 | 238 / 2353 (10.1%) | 17.5 a |
| Tesouro IPCA+ | 2050-08-15 | IPCA + 7.37% | 2026-07-27 | 106 / 369 (28.7%) | 22.4 a |

---
FATO VERIFICADO: taxas e PUs do CSV oficial. INFERÊNCIA DO SISTEMA: duration/DV01/convexidade e cenários (fórmulas em investment_os/engine/fixed_income.py, testadas). 
Este relatório é apoio à decisão; não é recomendação nem promessa de retorno. Taxas do Tesouro Direto (varejo) — não misturar com taxas indicativas ANBIMA.