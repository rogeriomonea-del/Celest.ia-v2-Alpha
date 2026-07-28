# Fase 5 — Evidência do fluxo ponta a ponta (execução real)

**CARTEIRA DE DEMONSTRAÇÃO SINTÉTICA** — quantidades/custos fictícios de fixture;
preços e setores vêm das fontes oficiais ingeridas (B3 COTAHIST / CVM).

## 1. Perfil (assessment 1) — confiança ALTA, conflitos: nenhum
- scores: capacidade_risco 75, concentracao_patrimonial 70, conhecimento_experiencia 58, dependentes 90, disposicao_risco 90, drawdown_toleravel 65, estabilidade_renda 75, exposicao_brasil 45, exposicao_internacional 60, horizonte 95, liquidez 75, necessidade_renda 75, necessidade_retorno 60, passivos 95, reserva 100, restricoes 80, tributacao 60

## 2. IPS v1 confirmada
- faixas: acao_br 49–74%, fii 0–20%, renda_fixa 0–51%, internacional 0–20%, cripto 0–5%
- aporte mensal: R$ 100,000

## 3. Importação 1 (adaptador generic_csv_v1) — contagens {'ok': 4, 'ambiguous': 1}, PII removida: 0
- correção manual: HGLG11 confirmado como FII (user_override)
- snapshot v1 criado (idempotente: False)

## 4. Análise — patrimônio precificado R$ 107,787.00 (cobertura 100.0%, confiança ALTA)
- preços B3 (não ajustados) de 2026-07-27; custo desconhecido preservado: ['WEGE3', 'HGLG11']
- pesos por classe: {'acao_br': 83.63, 'fii': 16.37} | concentração: top 28.09%, HHI 0.2137
- violações detectadas: 6 (ex.: {"tipo": "class_band", "chave": "acao_br", "peso_pct": 83.63, "faixa": {"min_pct": 49, "max_pct": 74}, "severidade": "critica"})

## 5. Plano 1 (aporte R$ 100,000/mês)
- próximo aporte (soma R$ 100,000): {'acao_br': 15174.43, 'fii': 3703.25, 'renda_fixa': 54437.34, 'internacional': 21347.98, 'cripto': 5337.0}
- vendas evitadas: R$ 10,379.89
- dentro das faixas após 6 meses: True; pesos projetados: {'acao_br': 50.68, 'fii': 10.27, 'renda_fixa': 26.2, 'internacional': 10.27, 'cripto': 2.57}
- premissas: preços estáticos durante a simulação (horizonte de planejamento, não previsão); sem dados de proventos e vencimentos ingeridos (fases futuras) — não considerados; imposto não estimado onde o custo de aquisição é desconhecido

Ações:
1. [manter] class:acao_br prioridade 1 — violação crítica resolvida pelo próprio 1º aporte (peso projetado 43.4% <= teto 74%); venda de R$ 10,380 evitada
2. [aumentar_com_aportes] class:acao_br prioridade 2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
3. [aumentar_com_aportes] class:fii prioridade 2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
4. [aumentar_com_aportes] class:renda_fixa prioridade 2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
5. [aumentar_com_aportes] class:internacional prioridade 2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro
6. [aumentar_com_aportes] class:cripto prioridade 2 — classe abaixo da faixa-alvo pós-aporte; aporte novo evita venda e giro

Bloqueio verificado: POST /rebalance sem IPS confirmada retorna 409 policy_not_confirmed (testado na suíte).
Auditoria sanitizada em data/portfolio.db::audit_log (eventos, hashes e contagens; sem PII, sem valores pessoais em logs de aplicação).