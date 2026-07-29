# ADR-0005 — Escopo e decisões da Fase 6 (macro, Tesouro e renda fixa completa)

Data: 2026-07-28. Status: aceita.

## Decisões

1. **Macro Brasil via BCB apenas** (SGS + Focus/Olinda): 7 séries SGS (Selic
   meta, CDI, IPCA, PTAX, IBC-Br, IGP-M, dívida bruta/PIB) + expectativas
   anuais do Focus. IBGE/FRED/IMF/BIS/ECB ficam registrados no SOURCE_REGISTRY
   para fases futuras. IPCA e IGP-M chegam via SGS (replicação BCB de
   IBGE/FGV — fonte declarada).
2. **API SGS por intervalo de datas**: a API limita `ultimos/N` a 20 valores;
   consultas usam dataInicial/dataFinal (janela de ~9 anos, sob o teto de 10
   anos para séries diárias).
3. **Point-in-time**: o SGS publica vigência FUTURA da meta Selic; o silver
   trunca em `data <= data de ingestão`.
4. **Regimes determinísticos**: regras simples e testadas por dimensão
   (inflação, política monetária, atividade, câmbio, risco fiscal,
   expectativas), com confiança por staleness do dado. Dimensão sem dado =
   INDISPONIVEL. Focus é sempre rotulado EXPECTATIVA DE MERCADO. Premissa
   paramétrica: meta de inflação 3,0% ± 1,5 p.p.
5. **Matriz geopolítica NÃO implementada**: sem fonte oficial de eventos
   integrada, nada é pontuado (regra do projeto: rumor não pontua; "não
   verificado" fica fora do score). Declarado no payload.
6. **Modelagem de títulos por tipo, honesta**: Prefixado (zero nominal),
   Prefixado c/ Juros (10% a.a.), IPCA+ (zero real), IPCA+ c/ Juros (6% a.a.
   real) são modelados (duration/DV01/convexidade/MTM). Tesouro Selic
   (pós-fixado, duration efetiva ~0), Renda+/Educa+ (fluxo de parcelas na
   conversão) e IGPM+ (legado) NÃO são modelados — motivo declarado, nunca um
   número inventado.
7. **Curvas do Tesouro Direto (varejo)**: pontos por vencimento na última
   data-base, separando nominal (prefixados) e real (IPCA+). Rotuladas como
   taxas ofertadas ao varejo — NÃO é a curva indicativa ANBIMA (fonte distinta,
   não integrada).
8. **Radar de janelas**: taxa atual ≥ percentil 80 da própria série do título
   (mín. 250 pregões), hysteresis de saída no percentil 70, prazo mínimo de 1
   ano até o vencimento (taxas de fim de prazo distorcem). Janela NUNCA é
   recomendação; cada alerta traz critério e invalidação.

## Consequências

- O painel frontend (visão geral, Tesouro, macro) consome exclusivamente os
  artefatos gold gerados por `python -m investment_os.cli macro`.
- A troca da curva varejo pela ANBIMA (quando integrada) é um novo bloco no
  gold, não uma substituição silenciosa de metodologia.
