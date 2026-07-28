# Roadmap

Ordem de construção fixa (mudanças exigem ADR). Fase 0 e a fatia vertical da
Fase 1–4 (parcial) entregues nesta iteração.

| Fase | Escopo | Status |
|---|---|---|
| 0 — Descoberta e contratos | Auditoria, PRD, arquitetura, dicionário de dados, registro de fontes/métricas, threat model, agentes, CLAUDE.md | ✅ entregue |
| 1 — Fundação de dados | Ingestão CVM/B3/Tesouro, bronze/silver, auditoria de ingestão, identificadores canônicos, data health básico | ✅ entregue (MVP; sem Postgres — ADR-0002) |
| 2 — Motor financeiro | Normalização DFP/ITR, períodos, TTM, indicadores testados, composição de capital | ✅ entregue (subset de fórmulas do METRIC_REGISTRY; setorial: bancos tratados como NAO_APLICAVEL nas métricas de dívida) |
| 3 — Screener e Ativo 360 | Presets versionados, aprovadas/quase aprovadas, relatórios MD/CSV/HTML, Ativo 360, ranking sem forçar vencedores | ✅ entregue (universo = companhias com DFP consolidado + preço B3; comparação percentil setorial limitada ao universo ingerido) |
| 4 — Inteligência documental | Download oficial, extração por página, citações verificáveis, análise do último período vs 3T25 | ◐ parcial (download DFP/press release via CVM + citações; RAG/pgvector futuro) |
| 5 — Perfil, carteira e B3 | Questionário, IPS, importador B3 com PII scrubber, análise de posições, rebalanceamento aporte-first | ✅ entregue (XLSX/CSV; PDF fora do MVP — ADR-0004; frontend conectado à API) |
| 6 — Macro e Tesouro | BCB SGS/Focus, regimes determinísticos, painel Tesouro completo (curvas, radar, MTM) | ✅ entregue (IBGE/global e matriz geopolítica adiados — ADR-0005; geopolítica sem fonte oficial não pontua) |
| 7 — Chat | Ferramentas estruturadas, respostas citadas, anti-alucinação | ⏳ |
| 8 — Backtests, alertas e produção | Point-in-time, alertas com hysteresis, observabilidade, deploy | ⏳ |

## Integração com o frontend (Celst.ia-Finance)

- Fase 3+: substituir dados simulados do Next.js pelo consumo da API FastAPI
  deste repo (contrato = artefatos gold JSON documentados).
- Regra imediata aplicada lá: nenhum dado simulado exibido como real.
