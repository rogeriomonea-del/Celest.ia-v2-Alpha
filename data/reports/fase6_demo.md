# Fase 6 — Evidência (execução real com dados oficiais BCB + Tesouro)

Gerado em 2026-07-28. Fontes: BCB SGS/Focus (dados abertos), Tesouro Transparente.

## Regimes macro (regras determinísticas; confiança por staleness)

- **inflacao**: acelerando (confiança MEDIA, data-base 2026-06-01, fonte bcb_sgs:433 (IBGE)) — IPCA 12m 4.64%; 3m anualizado 5.66%; fora da banda da meta (3.0±1.5) [premissa]
- **politica_monetaria**: afrouxando (confiança ALTA, data-base 2026-07-28, fonte bcb_sgs:432) — meta Selic 14.25% a.a. vs 15.00% há ~6 meses
- **atividade**: acelerando (confiança MEDIA, data-base 2026-05-01, fonte bcb_sgs:24363) — IBC-Br (dessaz.): média 3m 113.8 vs 3m anteriores 105.5 (+7.89%)
- **cambio**: neutro (confiança ALTA, data-base 2026-07-28, fonte bcb_sgs:1) — PTAX 5.12 vs média 12m 5.26 (±0.17)
- **risco_fiscal**: aumentando (confiança MEDIA, data-base 2026-05-01, fonte bcb_sgs:13762) — dívida bruta/PIB 81.0% vs 75.8% há 12m (+5.3 p.p.)
- **expectativas_inflacao**: ancoradas (confiança MEDIA, data-base 2026-07-24, fonte bcb_focus) — mediana Focus IPCA ano seguinte: 4.22% vs meta 3.0±1.5 [premissa]

Premissas: meta de inflação de referência 3.0% ± 1.5 p.p. (parametrizável); regras de classificação documentadas em investment_os/engine/regimes.py (determinísticas, testadas); macro NUNCA justifica comprar empresa ruim: uso restrito a cenário, sensibilidade, risco e ritmo de aportes

## Painel Tesouro — data-base 2026-07-27 (60 títulos)

Curva real (Tesouro IPCA+ principal, taxas de compra — varejo, NÃO ANBIMA):

- 2026-08-15: IPCA + 12.53%
- 2029-05-15: IPCA + 8.23%
- 2032-08-15: IPCA + 8.23%
- 2035-05-15: IPCA + 8.07%
- 2040-08-15: IPCA + 7.64%
- 2045-05-15: IPCA + 7.40%
- 2050-08-15: IPCA + 7.37%

Radar de janelas (20 abertas; percentil >= 80 da própria série, prazo mínimo 1 ano):

- Tesouro IPCA+ 2029-05-15: 8.23% (P96); invalidação: taxa abaixo de 7.67% (percentil 70) encerra a janela
- Tesouro IPCA+ 2035-05-15: 8.07% (P100); invalidação: taxa abaixo de 6.11% (percentil 70) encerra a janela
- Tesouro IPCA+ 2040-08-15: 7.64% (P96); invalidação: taxa abaixo de 7.31% (percentil 70) encerra a janela
- Tesouro IPCA+ 2045-05-15: 7.40% (P98); invalidação: taxa abaixo de 6.02% (percentil 70) encerra a janela
- Tesouro IPCA+ 2050-08-15: 7.37% (P94); invalidação: taxa abaixo de 7.09% (percentil 70) encerra a janela
- Tesouro IPCA+ com Juros Semestrais 2030-08-15: 8.29% (P98); invalidação: taxa abaixo de 6.31% (percentil 70) encerra a janela
- Tesouro IPCA+ com Juros Semestrais 2032-08-15: 8.24% (P98); invalidação: taxa abaixo de 7.51% (percentil 70) encerra a janela
- Tesouro IPCA+ com Juros Semestrais 2035-05-15: 8.10% (P98); invalidação: taxa abaixo de 6.43% (percentil 70) encerra a janela

## Referência monitorada — Tesouro IPCA+ 2050
- taxa atual IPCA + 7.37% (percentil 94.3 da série de 369 pregões)
- duration modificada 22.4 anos; DV01 R$ 0.405; convexidade 522.7
- cenário +200bps: -35.9% no PU; -200bps: +57.2%

Títulos NÃO modelados declaram o motivo (Selic pós-fixado, Renda+/Educa+ com fluxo de parcelas, IGPM+ legado) — nunca um número inventado.
Janela aberta NÃO é recomendação; cada alerta traz critério e invalidação.
Matriz geopolítica: sem fonte oficial de eventos integrada — nada é pontuado (ADR-0005).