# ADR-0006 — Fase 7: chat "Pergunte à IA", freshness de dados, universo B3 completo e brapi como fonte secundária

Data: 2026-07-28. Status: aceita.

## Contexto

O usuário pediu: (a) chat com ferramentas estruturadas e resposta obrigatória
com evidências/fontes/confiança; (b) verificação de atualização "em tempo
real" dos ativos; (c) banco de ativos com TODOS os ativos da B3; (d) uso da
chave brapi do próprio usuário como fonte intradiária.

## Decisões

1. **Freshness: bronze datado para fontes mutáveis.** O bronze é imutável,
   mas os arquivos oficiais mudam diariamente (CSV do Tesouro cresce, ZIPs
   CVM ganham reapresentações, COTAHIST anual ganha pregões). Ingerir sempre
   no mesmo nome congelava o sistema na primeira ingestão. Agora: Tesouro,
   cadastro CVM, DFP/ITR/FCA de anos correntes/anterior e COTAHIST do ano
   corrente são gravados como `{nome}.{YYYY-MM-DD}.{ext}` — cada dia de
   ingestão gera nova versão bronze SEM sobrescrever as anteriores
   (imutabilidade + refresh). O build resolve a variante datada mais recente.

2. **"Tempo real" honesto: as fontes oficiais são D-1/EOD.** COTAHIST é
   publicado após o fechamento; o CSV do Tesouro reflete a manhã do dia útil.
   Com fontes oficiais gratuitas NÃO existe tempo real; o sistema atualiza a
   cada execução do pipeline (`cli ingest && cli build && cli macro`) e expõe
   a data-base em toda resposta. Isso é declarado ao usuário, não mascarado.

3. **Universo B3 completo no silver.** `silver/quotes.build(tickers=None)`
   passa a materializar TODO o mercado a vista (tp_merc=010): ~2.468 tickers
   (ações, FIIs, BDRs, ETFs, units), substituindo o recorte de 7 ativos da
   demo. Novo `asset_registry.parquet` com última cotação por ticker e
   classificação de tipo HEURÍSTICA (BDI 12=FII; sufixos 31/32/33/34/35/39=
   BDR; final 11=unit se emissor FCA, senão ETF/fundo provável) com rótulo de
   confiança ALTA/MEDIA/BAIXA — nunca apresentada como cadastro oficial.
   Exposto em `GET /v1/ativos`.

4. **brapi.dev como fonte SECUNDÁRIA autorizada (exceção documentada).**
   Agregadores seguem PROIBIDOS como fonte primária. O usuário autorizou
   explicitamente sua chave brapi para cotação intradiária INDICATIVA.
   Limites rígidos: uso exclusivo em exibição (`/v1/ativos/{t}/intradiario` e
   ferramenta `get_intraday_quote`), rotulado "AGREGADOR — não oficial",
   `usavel_em_calculos: false`, nunca persistido em bronze/silver/gold, nunca
   insumo de indicador/screener/rebalanceamento, token apenas via env
   `IIOS_BRAPI_TOKEN`, payload externo filtrado campo a campo (é DADO). O
   fechamento oficial B3 D-1 acompanha toda resposta intradiária.

5. **Chat: o LLM nunca calcula.** 11 ferramentas determinísticas
   (`chat/tools.py`) leem gold/DB/registros e carregam fonte + data-base +
   avisos; erros são estruturados sem traceback/SQL. O orquestrador
   (`chat/orchestrator.py`, SDK Anthropic, modelo `claude-opus-5`, thinking
   adaptativo) obriga resposta final estruturada via ferramenta
   `finalize_answer` (evidências, fontes, data-base, premissas, confiança,
   riscos, contra-argumento, dados ausentes, gatilhos). Texto livre no fim do
   turno dispara nova chamada com `tool_choice` forçado. Recusa do modelo e
   estouro do limite de iterações viram fallback estruturado de confiança
   BAIXA.

6. **Privacidade e anti-injeção no chat.** PII ESTRUTURADA (CPF, e-mail,
   telefone, CEP, agência/conta, endereço — o escopo do scrubber
   determinístico da Fase 5) é removida da pergunta e do histórico ANTES de
   qualquer envio ao LLM. Limite declarado: nomes próprios, RG e data de
   nascimento NÃO são detectados pelo scrubber atual — não digite dados
   pessoais além do necessário. Resultados de ferramenta viajam serializados
   como DADOS (nunca instruções — regra fixada no system prompt); o chat não
   recebe SQL nem segredos; sem `ANTHROPIC_API_KEY` o endpoint responde 503
   estruturado e NENHUMA outra função do sistema depende do LLM.
   Gate anti-alucinação em código (não só no prompt): resposta sem evidências
   com fonte tem a confiança rebaixada para BAIXA e a lacuna registrada em
   `dados_ausentes`.

7. **Chat não recomenda.** O assistente apresenta evidências e
   contra-argumento; recomendação positiva continua exigindo red-team +
   qa-evidence-auditor fora do chat (Definition of Done do projeto).

## Consequências

- Re-executar o pipeline diariamente atualiza tudo (candidato natural a cron;
  fora do escopo desta fase).
- O bronze acumula uma versão datada por dia de ingestão (custo de disco
  aceito em troca de auditabilidade e reprodutibilidade point-in-time).
- Virada de ano: o build resolve fixo-vs-datado pelo timestamp de INGESTÃO do
  sidecar meta (não por preferência incondicional), e o COTAHIST do ano
  anterior continua datado por 1 ano — o download completo pós-fechamento
  vence as variantes parciais. Limite residual documentado: se NENHUMA
  ingestão ocorrer durante todo o ano seguinte ao fechamento, a última
  variante parcial permanece a mais recente até a próxima ingestão do
  período (mesmo comportamento de qualquer dado não re-ingerido).
- BDR/FII/ETF têm registro e cotação, mas sem análise fundamentalista no MVP
  (screener cobre companhias abertas CVM) — o chat declara isso em avisos.
