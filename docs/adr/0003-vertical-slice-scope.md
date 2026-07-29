# ADR-0003 — Escopo e cortes da primeira fatia vertical

Data: 2026-07-28. Status: aceita.

## Decisões de escopo (com justificativa)

1. **FII fora do cálculo fundamentalista do MVP.** As demonstrações de FIIs vivem
   em datasets CVM distintos (informes mensais/trimestrais de FII), com plano de
   contas próprio. A fatia inclui FII apenas com dados de mercado (preço/liquidez
   COTAHIST) e estrutura de entidade; indicadores específicos (P/VP, FFO, vacância)
   ficam para a fase seguinte. Alternativa rejeitada: improvisar P/VP com dado não
   oficial — violaria a regra de fontes.
2. **Bancos**: métricas de dívida/EBITDA marcadas NAO_APLICAVEL; ROE/P/L/P/VPA
   calculados normalmente. NIM/Basileia exigem contas específicas do plano COSIF —
   fase seguinte.
3. **Dividend yield e retorno total**: INDISPONIVEL no MVP (COTAHIST não é
   ajustado por proventos; ingestão de eventos corporativos ainda não existe).
4. **Percentil setorial do P/L**: calculado sobre o universo ingerido usando
   `SETOR_ATIV` CVM; quando o setor tem < 5 pares, cai para limite absoluto
   configurável com flag de limitação (regra do preset preservada).
5. **Análise documental**: 1 documento oficial (DFP/ITR ou release via IPE) por
   empresa demonstrada, com citações por página verificáveis. RAG completo depois.
6. **API**: FastAPI somente leitura sobre artefatos gold (suficiente para a
   demonstração; frontend integra na Fase 3+).

## Ativos da demonstração (selecionados por liquidez/disponibilidade, NÃO recomendação)
- Não financeiras (setores distintos): VALE3 (mineração), PETR4 (petróleo/gás),
  WEGE3 (bens industriais).
- Financeira: ITUB4 (Itaú Unibanco Holding).
- FII: somente mercado (ver corte 1) — HGLG11 (logística, alta liquidez).
- Renda fixa: Tesouro IPCA+ 2050 (15/08/2050).
