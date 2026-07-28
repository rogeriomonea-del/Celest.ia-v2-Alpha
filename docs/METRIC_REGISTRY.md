# Registro de Métricas

Todas implementadas como funções puras em `investment_os/engine/` com testes em
`tests/investment_os/`. Nenhuma métrica pode ser exibida sem: fonte, data-base,
período, fórmula, unidade, status de qualidade.

## Estados de valor (nunca usar 0 para "indisponível")

`OK` | `NAO_APLICAVEL` | `PREJUIZO` | `TURNAROUND` | `DADO_INSUFICIENTE` |
`SERIE_NAO_COMPARAVEL` | `INDISPONIVEL`

## Métricas de demonstrações (fonte: CVM DFP/ITR, consolidado prioritário)

| Métrica | Fórmula | Regras |
|---|---|---|
| Receita LTM | soma 4 trimestres isolados mais recentes | trimestres isolados derivados de acumulados YTD |
| Lucro líquido atribuível LTM | idem, conta consolidada atribuível a controladores | usa DRE consolidada; se ausente → INDISPONIVEL |
| P/L | valor de mercado total ÷ lucro líquido atribuível LTM | lucro ≤ 0 → PREJUIZO (sem número); sem market cap → INDISPONIVEL |
| P/VPA | valor de mercado total ÷ PL atribuível a controladores | PL ≤ 0 → NAO_APLICAVEL; P/VPA < 1 NÃO é automaticamente barato |
| ROE LTM | lucro atribuível LTM ÷ PL médio (início/fim) | PL médio ≤ 0 → NAO_APLICAVEL |
| ROE mediano 5a | mediana dos ROE anuais de 5 exercícios | < 4 exercícios válidos → DADO_INSUFICIENTE |
| Margem bruta/EBIT/líquida | resultado ÷ receita do período | receita ≤ 0 → NAO_APLICAVEL |
| EBITDA (proxy) | EBIT + D&A (DFC método indireto) | rotulada PROXY; bancos → NAO_APLICAVEL |
| Dívida bruta | empréstimos/financiamentos circulante + não circulante | por prefixo de conta padronizada CVM |
| Dívida líquida | dívida bruta − caixa e equivalentes − aplicações financeiras CP | |
| Dívida líquida/EBITDA | dívida líquida ÷ EBITDA LTM | EBITDA ≤ 0 → NAO_APLICAVEL; bancos → NAO_APLICAVEL |
| CAGR (receita/lucro/FCF) | (fim/início)^(1/n) − 1 | exige início > 0 E fim > 0 E mesma unidade; senão SERIE_NAO_COMPARAVEL, exibir evolução anual |
| FCF proxy | fluxo de caixa operacional − CAPEX total (DFC) | rotulada FCF_PROXY; owner earnings NÃO calculado (sem estimativa de CAPEX de manutenção) |
| Conversão de caixa | CFO LTM ÷ lucro líquido LTM | lucro ≤ 0 → NAO_APLICAVEL |
| Accrual ratio | (lucro − CFO) ÷ ativos totais médios | |

## Métricas de mercado (fonte: B3 COTAHIST — preços NÃO ajustados por proventos)

| Métrica | Fórmula | Regras |
|---|---|---|
| Preço | fechamento do último pregão disponível | sempre com data do pregão |
| Valor de mercado total | Σ (preço da classe × qtde de ações da classe) | exige qtde de ações por classe (FRE/composição de capital); ausente → INDISPONIVEL |
| Liquidez média | média diária de volume financeiro (63 pregões) | |
| Dividend yield | proventos 12m ÷ preço | NÃO calculado no MVP (exige eventos corporativos ajustados) → INDISPONIVEL |

## Renda fixa (fonte: Tesouro Direto CSV oficial)

| Métrica | Fórmula | Regras |
|---|---|---|
| Duration Macaulay | Σ t·PV(CF_t) ÷ preço | fluxo real de NTN-B (cupom 6% a.a. semestral); em anos |
| Modified duration | duration ÷ (1 + y/2 períodos) | y = taxa da data-base |
| DV01 | ΔPU para +1bp (diferença central) | em R$ por título |
| Convexidade | derivada segunda numérica do PU | |
| Cenários MTM | reprecificação a y±{50,100,150,200}bps | efeito duration + convexidade explicitados |
| Janela de taxa | pregões com taxa ≥ limite; janelas contínuas; duração; percentil; máx/mín/média/mediana | por título (tipo+vencimento); NUNCA misturar vencimentos; hysteresis configurável p/ alertas |

Observação: análise usa `Taxa Compra Manha` (taxa ofertada ao varejo). Comparações
com mercado secundário (ANBIMA) exigirão rótulo de metodologia distinta.

## Scores (fase posterior)

Investment Quality / Valuation / Risk / Opportunity / Evidence Confidence /
Data Quality — sempre exibidos com componentes e confiança; red flags impeditivas
nunca são mascaradas pelo score agregado. Não implementados no MVP além do
Data Quality básico (statuses por métrica).
