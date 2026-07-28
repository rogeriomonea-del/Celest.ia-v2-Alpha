# Premissas Registradas

Valores iniciais EDITÁVEIS do investidor (não substituem suitability — Res. CVM 30):

| Parâmetro | Valor inicial | Onde configurar |
|---|---|---|
| Idade | 25 | perfil (fase 5) |
| Moeda-base | BRL | `IIOS_BASE_CURRENCY` |
| Estilo | buy & hold | perfil |
| Horizonte principal | > 10 anos (metas de 3–5 anos permitidas) | perfil |
| Aporte mensal | R$ 100.000 | `IIOS_MONTHLY_CONTRIBUTION` |
| Reserva | ~18 meses de despesas (declarada) | perfil |
| Tolerância a volatilidade | elevada (declarada) | perfil |
| Taxa de referência | Tesouro IPCA+ 2050 a IPCA + 7,11% a.a. | `IIOS_REFERENCE_RATE_BPS` |

Nunca inferir composição/valor de carteira sem importação confirmada.

## Premissas técnicas do MVP

1. **Armazenamento**: DuckDB/parquet/SQLite local no lugar de PostgreSQL (ADR-0002).
2. **EBITDA proxy** = EBIT (DRE 3.05) + depreciação/amortização da DFC-MI; rotulado
   PROXY; difere de EBITDA gerencial divulgado pelas companhias.
2b. **Escala da composição de capital CVM é inconsistente** (fato verificado:
   Petrobras/WEG reportam em unidades; Vale/Itaú em milhares). A escala é
   resolvida por validação cruzada com o LPA básico ON (conta 3.99, em R$/ação,
   sem ESCALA_MOEDA); fallback: plausibilidade do VPA/ação. Sem validação
   inequívoca, valor de mercado = INDISPONIVEL (nunca palpite silencioso).
2c. **Bancos/seguradoras** usam template contábil próprio: PL e lucro líquido são
   localizados por descrição de conta (conceito), não por código fixo 2.03/3.11.
2d. **Emissores que reportam em moeda != REAL** ficam fora do universo do MVP.
3. **Preços B3 não ajustados** por proventos; nenhuma métrica de retorno total é
   exibida no MVP; dividend yield = INDISPONIVEL.
4. **Classificação setorial** do MVP usa `SETOR_ATIV` do cadastro CVM (menos
   granular que a taxonomia B3); percentis setoriais são calculados apenas quando
   há ≥ 5 pares no setor no universo ingerido, caso contrário usa-se limite
   absoluto configurável com a limitação declarada.
5. **WACC**: não estimado no MVP (exige beta, curva e prêmio de risco com fontes
   ainda não integradas) → spread ROIC−WACC = INDISPONIVEL.
6. **Universo do screener** = companhias ativas com DFP consolidada 2021–2025 +
   preço B3 recente + composição de capital válida. Companhias que saíram da bolsa
   permanecem nos dados históricos (mitiga survivorship na análise histórica, mas
   o screener corrente é sobre ativos negociáveis hoje).
7. **Fluxo da NTN-B (Tesouro IPCA+)**: cupom 6% a.a. pago semestralmente para
   títulos "com Juros Semestrais"; "Tesouro IPCA+" (principal) é zero-coupon em
   termos reais. Duration calculada sobre o fluxo REAL usando a taxa real do dia.
8. **Última demonstração disponível** é detectada dinamicamente (máx `DT_FIM_EXERC`
   com `DT_RECEB` ≤ hoje); 3T25 é usado apenas como base de comparação histórica.
9. Datas/timestamps de ingestão em UTC.
