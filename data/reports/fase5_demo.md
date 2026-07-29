# Fase 5 — Evidência do fluxo ponta a ponta (execução real, pós-red-team)

**CARTEIRA DE DEMONSTRAÇÃO SINTÉTICA** — quantidades/custos fictícios de fixture;
preços e setores vêm das fontes oficiais ingeridas (B3 COTAHIST / CVM).

## 1. Perfil (assessment 1) — confiança ALTA, conflitos: nenhum

## 2. IPS v1 confirmada — faixas: acao_br 49–74%, fii 0–20%, renda_fixa 0–51%, internacional 0–20%, cripto 0–5%
- aporte mensal: R$ 100,000 (origem: default_de_configuracao_revisar)

## 3. Importação 1 (generic_csv_v1) — contagens {'ok': 4, 'ambiguous': 1}, PII removida: 0
- correção manual: HGLG11 confirmado como FII (user_override)
- snapshot v1 criado (idempotente: False)

## 4. Análise — patrimônio precificado R$ 107,787.00 (cobertura 100.0%, confiança ALTA)
- preços B3 (não ajustados) de 2026-07-27; custo desconhecido: ['WEGE3', 'HGLG11']
- pesos por classe: {'acao_br': 83.63, 'fii': 16.37} | concentração: top 28.09%, HHI 0.2137
- violações: 10 (críticas incluem limite por ativo/emissor)

## 5. Plano 1 (aporte R$ 100,000/mês)
- próximo aporte (soma R$ 100,000): {'acao_br': 11673.36, 'fii': 4432.64, 'renda_fixa': 56297.29, 'internacional': 22077.37, 'cripto': 5519.35}
- vendas evitadas: R$ 10,379.89 | violações críticas endereçadas: 7
- dentro das faixas após 6m: True; pesos projetados: {'acao_br': 50.68, 'fii': 10.27, 'renda_fixa': 26.2, 'cripto': 2.57, 'internacional': 10.27}
- premissas: preços estáticos durante a simulação (horizonte de planejamento, não previsão); sem dados de proventos e vencimentos ingeridos (fases futuras) — não considerados; imposto não estimado onde o custo de aquisição é desconhecido; ATENÇÃO: aporte mensal de R$ 100,000 veio do DEFAULT de configuração, não de valor informado pelo usuário — todo o plano depende dele; revise a IPS

Ações:
1. [nao_aumentar] asset:VALE3 p1 — violação crítica do limite por ativo (28.1% vs 10%): não aumentar; diluição via aportes no restante da carteira; reduzir se persistir após 12 meses
2. [nao_aumentar] asset:PETR4 p1 — violação crítica do limite por ativo (22.8% vs 10%): não aumentar; diluição via aportes no restante da carteira; reduzir se persistir após 12 meses
3. [nao_aumentar] asset:ITUB4 p1 — violação crítica do limite por ativo (19.8% vs 10%): não aumentar; diluição via aportes no restante da carteira; reduzir se persistir após 12 meses
4. [nao_aumentar] asset:HGLG11 p1 — violação crítica do limite por ativo (16.4% vs 10%): não aumentar; diluição via aportes no restante da carteira; reduzir se persistir após 12 meses
5. [nao_aumentar] asset:33.592.510/0001-54 p1 — violação crítica do limite por emissor (28.1% vs 15%): não aumentar; diluição via aportes no restante da carteira; reduzir se persistir após 12 meses
6. [nao_aumentar] asset:33.000.167/0001-01 p1 — violação crítica do limite por emissor (22.8% vs 15%): não aumentar; diluição via aportes no restante da carteira; reduzir se persistir após 12 meses
7. [manter] class:acao_br p1 — violação crítica resolvida pelo próprio 1º aporte (peso projetado 43.4% <= teto 74%); venda de R$ 10,380 evitada
8. [aumentar_com_aportes] class:acao_br p2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
9. [aumentar_com_aportes] class:fii p2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
10. [aumentar_com_aportes] class:renda_fixa p2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
11. [aumentar_com_aportes] class:internacional p2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro | ATENÇÃO: classe ainda sem ativos ingeridos no sistema — execução e acompanhamento externos até a integração (fases 6+)
12. [aumentar_com_aportes] class:cripto p2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro | ATENÇÃO: classe ainda sem ativos ingeridos no sistema — execução e acompanhamento externos até a integração (fases 6+)

Bloqueios verificados na suíte: rebalance sem IPS -> 409; confirmação parcial sem aceite -> 409;
linha rejeitada não promovível por correção de ticker; auditoria sanitizada em audit_log.