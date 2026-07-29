# ADR-0001 — Coexistência com o código legado de viagens

Data: 2026-07-28. Status: aceita.

## Contexto
O repositório contém uma plataforma de busca de voos sem relação com finanças.
A regra do projeto proíbe alterações destrutivas.

## Decisão
O Investment Intelligence OS vive em diretórios novos (`investment_os/`, `docs/`,
`tests/investment_os/`, `data/`), sem tocar em `scrapers.py`,
`research_planner.py`, `celestia_dashboard/` ou `tests/*.py` legados.
O backend financeiro é Python (stack padrão do briefing), FastAPI para API.

## Consequências
- Zero risco de regressão no produto de viagens.
- O repositório passa a ter dois produtos; uma futura separação de repositórios é
  possível sem retrabalho, pois não há acoplamento.
