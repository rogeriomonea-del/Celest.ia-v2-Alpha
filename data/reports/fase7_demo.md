# Demo Fase 7 — ferramentas determinísticas do chat (dados reais)

Gerado executando `investment_os.chat.tools` contra o gold real desta máquina. O LLM não participa: são os MESMOS resultados que o chat usa como única origem de números. Sem `ANTHROPIC_API_KEY` o endpoint `/v1/chat` responde 503 estruturado (comportamento intencional).

## screen_market(status=APROVADA)

- Fonte: CVM DFP/ITR + B3 COTAHIST (fontes oficiais; ver campo fontes por empresa)
- Data-base: 2026-07-28
- Avisos: ['Preços B3 NÃO ajustados por proventos; proibido ler como retorno total.', 'Aprovação no screener NÃO é recomendação de compra.']

```json
{
 "preset": {
  "preset_id": "quality_deep_value",
  "version": 1,
  "not_evaluated_mvp": [
   "ausência de ressalva material não resolvida do auditor (pareceres não integrados)",
   "free float mínimo (FRE distribuição de capital não integrado)",
   "sem deterioração material recente da tese (análise qualitativa pendente)"
  ],
  "params": {
   "pvpa_max": 1.0,
   "pe_sector_percentile_max": 35,
   "pe_abs_max_fallback": 12.0,
   "min_sector_peers": 5,
   "roe_med5_min": 0.12,
   "nd_ebitda_max": 3.0,
   "rev_cagr_min": 0.1,
   "ni_cagr_min": 0.1,
   "max_rev_decline": -0.15,
   "cfo_pos_min_5y": 4,
   "fcf_pos_min_5y": 3,
   "min_liquidity_brl_day": 5000000.0
  }
 },
 "contagens": {
  "DADOS_INSUFICIENTES": 188,
  "REPROVADA": 236,
  "QUASE_APROVADA": 24,
  "APROVADA": 2
 },
 "empresas": [
  {
   "ticker": "GMAT3",
   "empresa": "GRUPO MATEUS S.A.",
   "setor": "Emp. Adm. Part. - Comércio (Atacado e Varejo)",
   "status": "APROVADA",
   "pl": "5.08",
   "pvpa": "0.80",
   "roe_ltm": "16.24",
   "roe_med5": "15.16",
   "div_liq_ebitda": "0.28",
   "cagr_receita": "24.73",
   "conversao_caixa": "1.24",
   "criterios_reprovados": "",
   "preco_data": "2026-07-27",
   "ultima_demonstracao": "2026-03-31"
  },
  {
   "ticker": "RECV3",
   "empresa": "PETRORECÔNCAVO S.A.",
   "setor": "Emp. Adm. Part. - Petróleo e Gás",
   "status": "APROVADA",
   "pl": "5.61",
   "pvpa": "0.71",
   "roe_ltm": "12.54",
   "roe_med5": "15.96",
   "div_liq_ebitda": "0.92",
   "cagr_receita": "31.98",
   "conversao_caixa": "2.39",
   "criterios_reprovados": "",
   "preco_data": "2026-07-27",
   "ultima_demonstracao": "2026-03-31"
  }
 ],
 "truncado_em": null,
 "pendencias_globais_do_preset": [
  "ausência de ressalva material não resolvida do auditor (pareceres não integrados)",
  "free float 
```

## analyze_asset(GMAT3)

- Fonte: CVM DFP/ITR + B3 COTAHIST (fontes oficiais; ver campo fontes por empresa)
- Data-base: 2026-07-27
- Avisos: ['Preços B3 NÃO ajustados por proventos; proibido ler como retorno total.']

```json
{
 "registro_b3": {
  "ticker": "GMAT3",
  "tipo": "acao_br",
  "classificacao_confianca": "ALTA",
  "cnpj_emissor": "24.990.777/0001-09",
  "ultimo_pregao": "2026-07-27",
  "ultimo_fechamento": 3.83
 },
 "fundamentos_screener": {
  "ticker": "GMAT3",
  "empresa": "GRUPO MATEUS S.A.",
  "cd_cvm": "25186",
  "setor": "Emp. Adm. Part. - Comércio (Atacado e Varejo)",
  "preco_data": "2026-07-27",
  "valor_mercado_brl": 8795222241.42,
  "liquidez_63d_brl": 22540608.317460317,
  "pl": "5.08",
  "pvpa": "0.80",
  "roe_ltm": "16.24",
  "roe_med5": "15.16",
  "div_liq_ebitda": "0.28",
  "cagr_receita": "24.73",
  "cagr_lucro": "24.66",
  "conversao_caixa": "1.24",
  "status": "APROVADA",
  "criterios_reprovados": "",
  "criterios_nao_avaliados": "",
  "ultima_demonstracao": "2026-03-31",
  "dt_receb_ultimo_doc": "2026-05-14",
  "link_doc": "http://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=157460",
  "fontes": "CVM DFP/ITR (dados.cvm.gov.br); B3 COTAHIST; preços não ajustados",
  "criterios": [
   {
    "criterio": "P/VPA < 1",
    "resultado": "PASS",
    "detalhe": "0.80x"
   },
   {
    "criterio": "P/L positivo e baixo",
    "resultado": "PASS",
    "detalhe": "5.08x vs limite absoluto 12x (setor com 4 pares < 5: percentil indisponível — limitação declarada)"
   },
   {
    "criterio": "ROE mediano 5a > 12%",
    "resultado": "PASS",
    "detalhe": "15.16%"
   },
   {
    "criterio": "Dívida líq./EBITDA < 3",
    "resultado": "PASS",
    "detalhe": "0.28x"
   },
   {
    "criterio": "CAGR receita > 10%",
    "resultado": "PASS",
    "detalhe": "24.73% a.a."
   },
   {
    "criterio": "CAGR lucro > 10%",
    "resultado": "PASS",
    "detalhe": "24.66% a.a."
   },
   {
    "criterio": "Receita estável (sem queda >15
```

## analyze_tesouro_window(tipo=IPCA)

- Fonte: Tesouro Transparente (CSV oficial) — taxas ofertadas ao varejo; NÃO é curva indicativa ANBIMA
- Data-base: 2026-07-27
- Avisos: ['Percentil alto indica taxa historicamente elevada, NÃO previsão de queda.', 'Taxas do varejo (Tesouro Direto); não é curva ANBIMA.']

```json
{
 "radar_janelas": [
  {
   "tipo": "Tesouro IPCA+",
   "vencimento": "2029-05-15",
   "taxa_atual_pct": 8.23,
   "percentil": 95.9,
   "criterio": "taxa atual >= percentil 80 da própria série (885 pregões)",
   "saida_hysteresis_pct": 7.67,
   "invalidacao": "taxa abaixo de 7.67% (percentil 70) encerra a janela",
   "nota": "taxa historicamente alta NÃO é recomendação; avalie objetivo, prazo e risco de marcação",
   "confianca": "MEDIA"
  },
  {
   "tipo": "Tesouro IPCA+",
   "vencimento": "2035-05-15",
   "taxa_atual_pct": 8.07,
   "percentil": 99.8,
   "criterio": "taxa atual >= percentil 80 da própria série (4087 pregões)",
   "saida_hysteresis_pct": 6.11,
   "invalidacao": "taxa abaixo de 6.11% (percentil 70) encerra a janela",
   "nota": "taxa historicamente alta NÃO é recomendação; avalie objetivo, prazo e risco de marcação",
   "confianca": "MEDIA"
  },
  {
   "tipo": "Tesouro IPCA+",
   "vencimento": "2040-08-15",
   "taxa_atual_pct": 7.64,
   "percentil": 96.5,
   "criterio": "taxa atual >= percentil 80 da própria série (369 pregões)",
   "saida_hysteresis_pct": 7.31,
   "invalidacao": "taxa abaixo de 7.31% (percentil 70) encerra a janela",
   "nota": "taxa historicamente alta NÃO é recomendação; avalie objetivo, prazo e risco de marcação",
   "confianca": "MEDIA"
  },
  {
   "tipo": "Tesouro IPCA+",
   "vencimento": "2045-05-15",
   "taxa_atual_pct": 7.4,
   "percentil": 97.7,
   "criterio": "taxa atual >= percentil 80 da própria série (2353 pregões)",
   "saida_hysteresis_pct": 6.02,
   "invalidacao": "taxa abaixo de 6.02% (percentil 70) encerra a janela",
   "nota": "taxa historicamente alta NÃO é recomendação; avalie objetivo, prazo e risco de marcação",
   "confianca": "MEDIA"
  },
  {
   "tipo": "Tesouro IPCA+",
   "vencimento": "2050-08-15",
   "taxa_a
```

## analyze_macro_regime()

- Fonte: BCB SGS + Focus (oficiais; ver campo fonte por regime)
- Data-base: 2026-07-28
- Avisos: ['Regimes são leitura de estado, não previsão.', 'Focus é EXPECTATIVA DE MERCADO, não fato realizado.']

```json
{
 "regimes": [
  {
   "dimensao": "inflacao",
   "estado": "acelerando",
   "detalhe": "IPCA 12m 4.64%; 3m anualizado 5.78%; fora da banda da meta (3.0±1.5) [premissa]",
   "confianca": "MEDIA",
   "data_base": "2026-06-01",
   "fonte": "bcb_sgs:433 (IBGE)",
   "natureza": "FATO VERIFICADO + INFERÊNCIA DO SISTEMA (regra documentada)"
  },
  {
   "dimensao": "politica_monetaria",
   "estado": "afrouxando",
   "detalhe": "meta Selic 14.25% a.a. vs 15.00% há ~6 meses",
   "confianca": "ALTA",
   "data_base": "2026-07-28",
   "fonte": "bcb_sgs:432",
   "natureza": "FATO VERIFICADO + INFERÊNCIA DO SISTEMA (regra documentada)"
  },
  {
   "dimensao": "atividade",
   "estado": "acelerando",
   "detalhe": "IBC-Br com ajuste sazonal: média 3m 110.8 vs 3m anteriores 110.0 (+0.72%)",
   "confianca": "MEDIA",
   "data_base": "2026-05-01",
   "fonte": "bcb_sgs:24364",
   "natureza": "FATO VERIFICADO + INFERÊNCIA DO SISTEMA (regra documentada)"
  },
  {
   "dimensao": "cambio",
   "estado": "neutro",
   "detalhe": "PTAX 5.12 vs média 12m 5.26 (±0.17)",
   "confianca": "ALTA",
   "data_base": "2026-07-28",
   "fonte": "bcb_sgs:1",
   "natureza": "FATO VERIFICADO + INFERÊNCIA DO SISTEMA (regra documentada)"
  },
  {
   "dimensao": "risco_fiscal",
   "estado": "aumentando",
   "detalhe": "dívida bruta/PIB 81.0% vs 75.8% há 12m (+5.2 p.p.)",
   "confianca": "MEDIA",
   "data_base": "2026-05-01",
   "fonte": "bcb_sgs:13762",
   "natureza": "FATO VERIFICADO + INFERÊNCIA DO SISTEMA (regra documentada)"
  },
  {
   "dimensao": "expectativas_inflacao",
   "estado": "ancoradas",
   "detalhe": "mediana Focus IPCA ano seguinte: 4.22% vs meta 3.0±1.5 [premissa]",
   "confianca": "ALTA",
   "data_base": "2026-07-24",
   "fonte": "bcb_focus",
   "natureza": "EXPECTATIVA DE MERCADO (Focus) — não é 
```

## explain_metric(P/L)

- Fonte: docs/METRIC_REGISTRY.md (metodologia oficial do sistema)
- Data-base: None
- Avisos: ['Estados de indisponibilidade nunca viram 0: OK|NAO_APLICAVEL|PREJUIZO|TURNAROUND|DADO_INSUFICIENTE|SERIE_NAO_COMPARAVEL|INDISPONIVEL']

```json
{
 "metrica": "P/L",
 "formula": "valor de mercado total ÷ lucro líquido atribuível LTM",
 "regras": "lucro ≤ 0 → PREJUIZO (sem número); sem market cap → INDISPONIVEL",
 "secao": "Métricas de demonstrações (fonte: CVM DFP/ITR, consolidado prioritário)"
}
```

## challenge_thesis(ALPA3) — empresa reprovada (critérios inteiros + custo de oportunidade rotulado por natureza da taxa)

- Fonte: screener (CVM/B3) + macro (BCB) + Tesouro Transparente — evidências determinísticas
- Data-base: 2026-07-27
- Avisos: ['Contra-argumento determinístico NÃO substitui o red-team; recomendação positiva exige thesis-red-team-agent + qa-evidence-auditor.']

```json
{
 "ticker": "ALPA3",
 "evidencias_contrarias": [
  "Critério do screener REPROVADO: P/VPA < 1",
  "Critério do screener REPROVADO: P/L positivo e baixo",
  "Critério do screener REPROVADO: ROE mediano 5a > 12%",
  "Critério do screener REPROVADO: CAGR receita > 10%",
  "Critério do screener REPROVADO: CAGR lucro > 10%",
  "Critério do screener REPROVADO: Lucro positivo nos 5 anos",
  "Regime macro (inflacao): acelerando — IPCA 12m 4.64%; 3m anualizado 5.78%; fora da banda da meta (3.0±1.5) [premissa]",
  "Regime macro (politica_monetaria): afrouxando — meta Selic 14.25% a.a. vs 15.00% há ~6 meses",
  "Regime macro (atividade): acelerando — IBC-Br com ajuste sazonal: média 3m 110.8 vs 3m anteriores 110.0 (+0.72%)",
  "Regime macro (cambio): neutro — PTAX 5.12 vs média 12m 5.26 (±0.17)",
  "Regime macro (risco_fiscal): aumentando — dívida bruta/PIB 81.0% vs 75.8% há 12m (+5.2 p.p.)",
  "Regime macro (expectativas_inflacao): ancoradas — mediana Focus IPCA ano seguinte: 4.22% vs meta 3.0±1.5 [premissa]",
  "Custo de oportunidade em Tesouro IPCA+ 2029-05-15: taxa REAL a.a. (acima do IPCA) de 8.23% (percentil 95.9 da própria série) na data-base 2026-07-27.",
  "Custo de oportunidade em Tesouro IPCA+ com Juros Semestrais 2030-08-15: taxa REAL a.a. (acima do IPCA) de 8.29% (percentil 98.1 da própria série) na data-base 2026-07-27.",
  "Custo de oportunidade em Tesouro Prefixado 2032-01-01: taxa NOMINAL a.a. de 14.69% (percentil 87.8 da própria série) na data-base 2026-07-27.",
  "Custo de oportunidade em Tesouro Prefixado com Juros Semestrais 2035-01-01: taxa NOMINAL a.a. de 14.74% (percentil 89.8 da própria série) na data-base 2026-07-27.",
  "Atenção: taxas REAIS (IPCA+/IGP-M+) e NOMINAIS (prefixado) não são comparáveis diretamente entre si nem com retornos nominais de ações
```

## get_intraday_quote(PETR4)

- Fonte: brapi.dev (AGREGADOR — não oficial; uso indicativo autorizado pelo usuário)
- Data-base: 2026-07-28T19:39:30.000Z
- Avisos: ['Cotação intradiária de agregador: NÃO é fonte primária, NÃO é usada em cálculos e pode divergir do oficial B3. Referência oficial: COTAHIST (D-1).', 'Nunca usar este valor em cálculo de indicador.']

```json
{
 "intradiario": {
  "ticker": "PETR4",
  "preco": 41.23,
  "variacao_pct": 0.54,
  "fechamento_anterior": 41.22,
  "data_hora": "2026-07-28T19:39:30.000Z",
  "moeda": "BRL",
  "fonte": "brapi.dev (AGREGADOR — não oficial; uso indicativo autorizado pelo usuário)",
  "aviso": "Cotação intradiária de agregador: NÃO é fonte primária, NÃO é usada em cálculos e pode divergir do oficial B3. Referência oficial: COTAHIST (D-1).",
  "usavel_em_calculos": false,
  "token_configurado": false
 },
 "oficial_d1": {
  "ticker": "PETR4",
  "tipo": "acao_br",
  "classificacao_confianca": "ALTA",
  "cnpj_emissor": "33.000.167/0001-01",
  "ultimo_pregao": "2026-07-27",
  "ultimo_fechamento": 41.01
 }
}
```

## Nota de auditoria sobre o payload do agregador

Na primeira geração deste demo, o payload do brapi era internamente
inconsistente: `preco` igual a `fechamento_anterior` (41.18) mas
`variacao_pct` 0.41% — coerente com o fechamento oficial B3 D-1 (41.01), não
com o campo do próprio agregador. É payload real (não inventado) e ilustra
exatamente por que a cotação de agregador é INDICATIVA, rotulada e proibida
em cálculos.
