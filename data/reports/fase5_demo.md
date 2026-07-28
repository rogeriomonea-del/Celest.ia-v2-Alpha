# Fase 5 — Evidência do fluxo ponta a ponta (execução real)

**CARTEIRA DE DEMONSTRAÇÃO SINTÉTICA** — quantidades/custos fictícios de fixture;
preços e setores vêm das fontes oficiais ingeridas (B3 COTAHIST / CVM).

## 1. Perfil avaliado (assessment 1)
- confiança: ALTA; conflitos: nenhum
- scores (amostra): disposição 90, capacidade 75, horizonte 95

## 2. IPS v1 confirmada
- faixas: acao_br 49–74%, fii 0–20%, renda_fixa 0–51%, internacional 0–20%, cripto 0–5%
- aporte mensal configurado: R$ 100,000

## 3. Importação (import 1, adaptador generic_csv_v1)
- contagens: {'ok': 4, 'ambiguous': 1} | PII removida: 0

- correção manual: HGLG11 confirmado como FII pelo usuário (user_override)
- snapshot v1 criado (idempotente: False)

## 4. Análise (dados oficiais: preços B3 de 2026-07-27)
- patrimônio precificado: R$ 107,787.00 (cobertura 100.0%)
- pesos por classe: {'acao_br': 83.63, 'fii': 16.37}
- concentração: maior posição 28.09%, HHI 0.2137
- custo desconhecido: ['WEGE3', 'HGLG11']
- violações: [{"tipo": "class_band", "chave": "acao_br", "peso_pct": 83.63, "faixa": {"min_pct": 49, "max_pct": 74}, "severidade": "critica"}, {"tipo": "asset_limit", "chave": "VALE3", "peso_pct": 28.09, "limite_pct": 10, "severidade": "critica"}, {"tipo": "asset_limit", "chave": "PETR4", "peso_pct": 22.83, "limite_pct": 10, "severidade": "critica"}, {"tipo": "asset_limit", "chave": "ITUB4", "peso_pct": 19.8, "limite_pct": 10, "severidade": "critica"}, {"tipo": "asset_limit", "chave": "HGLG11", "peso_pct": 16.37, "limite_pct": 10, "severidade": "critica"}, {"tipo": "asset_limit", "chave": "WEGE3", "peso_pct": 12.91, "limite_pct": 10, "severidade": "nao_critica"}]
- confiança: ALTA

## 5. Plano de rebalanceamento (plan 1, aporte R$ 100,000/mês)
- próximo aporte: {'acao_br': 15174.43, 'fii': 3703.25, 'renda_fixa': 54437.34, 'internacional': 21347.98, 'cripto': 5337.0}
- vendas evitadas: R$ 10,379.89
- dentro das faixas após 6 meses: True
- pesos projetados: {'acao_br': 50.68, 'fii': 10.27, 'renda_fixa': 26.2, 'internacional': 10.27, 'cripto': 2.57}
- premissas: preços estáticos durante a simulação (horizonte de planejamento, não previsão); sem dados de proventos e vencimentos ingeridos (fases futuras) — não considerados; imposto não estimado onde o custo de aquisição é desconhecido
- ações: 

  1. [nao_aumentar] class:acao_br prioridade 1 — violação crítica diluível por aportes em ~0 meses (premissa: preços estáticos); venda de R$ 10,380 evitada
  2. [aumentar_com_aportes] class:acao_br prioridade 2 — classe abaixo da faixa-alvo; aporte novo evita venda e giro
  3. [aumentar_com_aportes] class:fii prioridade 2 — classe abaixo da faixa-alvo; aporte novo evita venda e giro
  4. [aumentar_com_aportes] class:renda_fixa prioridade 2 — classe abaixo da faixa-alvo; aporte novo evita venda e giro
  5. [aumentar_com_aportes] class:internacional prioridade 2 — classe abaixo da faixa-alvo; aporte novo evita venda e giro
  6. [aumentar_com_aportes] class:cripto prioridade 2 — classe abaixo da faixa-alvo; aporte novo evita venda e giro