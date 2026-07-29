# ADR-0004 — Escopo e decisões da Fase 5 (perfil, IPS, carteira, rebalanceamento)

Data: 2026-07-28. Status: aceita.

## Decisões

1. **SQLite para as entidades da Fase 5** (`data/portfolio.db`): transacional,
   zero-dependência, migrations versionadas em SQL compatível com o alvo
   PostgreSQL (ADR-0002 mantida para produção). Dados pessoais ficam em
   `data/` (gitignored), nunca no repositório.
2. **PDF da B3 fora do MVP de importação.** Sem um arquivo real do Relatório
   Consolidado disponível, um parser de PDF seria baseado em suposições de
   layout. Prioridade a XLSX/CSV com adaptadores VERSIONADOS
   (`b3_consolidado_v1`, `generic_csv_v1`) e erro honesto de "layout não
   reconhecido". Fixtures de teste são sintéticas e rotuladas.
3. **Single-user no MVP**: perfil 1/carteira 1 criados sob demanda; o esquema
   de autorização Bearer está declarado no contrato OpenAPI, e a autenticação
   completa fica para a fase de produção (Fase 8).
4. **Escala de risco da IPS**: capacidade financeira LIMITA a disposição
   declarada (o menor dos dois define o risco usável) — opção conservadora.
5. **Rebalanceamento aporte-first**: violação crítica é vendida SOMENTE quando
   a diluição por aportes não a resolve em 12 meses (limite configurável).
   Simulação com premissa declarada de preços estáticos. Proventos e
   vencimentos não são considerados (dados não ingeridos — fases 6+).
6. **Imposto**: nunca estimado quando o custo de aquisição é desconhecido;
   custo ausente permanece NULL/"desconhecido", jamais zero.
7. **Contribuição de risco por posição**: indisponível no MVP (exige séries de
   retornos por ativo); declarada como dado ausente, não aproximada.

## Consequências

- A importação real do Relatório Consolidado B3 (XLSX oficial do usuário) deve
  funcionar via `b3_consolidado_v1` se os cabeçalhos baterem; caso contrário o
  usuário recebe erro claro e pode usar o CSV padrão documentado.
- Migração SQLite -> PostgreSQL exigirá apenas port das migrations e do módulo
  `portfolio/db.py` (SQL já compatível em sua maior parte).
