# Protocolo de scraping do celest.ia

Este documento é uma **diretriz do sistema**: descreve como o celest.ia raspa
tarifas das companhias, quais estratégias existem e como o orquestrador
**aprende sozinho** qual delas vale mais a pena.

## As três estratégias

Cada companhia (Copa, LATAM) pode ser raspada por três caminhos, do mais
eficiente ao mais robusto:

| Estratégia | Como funciona | Prós | Contras |
|---|---|---|---|
| **firecrawl_interact** | Abre uma **sessão de browser viva** (Firecrawl v2), preenche o formulário com prompts em linguagem natural e extrai as tarifas — de **várias companhias de uma vez** | Rápido, econômico (1 sessão), pega metasearch | Depende do Firecrawl; output em linguagem natural |
| **firecrawl_scrape** | Firecrawl estático (`/v1/scrape`) sobre o deep-link de resultados | Simples | Sites SPA às vezes retornam página vazia |
| **playwright_local** | Chromium local intercepta o JSON de preços que o site consome | Sem custo de API | Anti-bot pode bloquear |

## Fluxo Interact (o preferido)

Sequência validada (ver `providers/firecrawl_interact.py`), reutilizando o
mesmo `scrapeId` em todos os passos para economizar créditos:

```
1) POST {base}/v2/scrape {url}                  -> abre sessão, devolve scrapeId
2) POST {base}/v2/scrape/{id}/interact {prompt}  -> preenche origem/destino
3) POST {base}/v2/scrape/{id}/interact {prompt}  -> datas + pesquisar
4) POST {base}/v2/scrape/{id}/interact {prompt}  -> extrai as tarifas em JSON
5) DELETE {base}/v2/scrape/{id}/interact          -> encerra a sessão (sempre)
```

O último passo pede o JSON estruturado (`offers[]` com airline, cabin, price,
currency, departure_time, duration, stops). O parser converte **USD → BRL**
(`USD_BRL_RATE`) quando o site cota em dólar e mapeia rótulos de companhia
(COPA, Avianca, LATAM…) para os códigos IATA.

## Como o orquestrador decide (self-improvement)

O sistema **não fixa** uma estratégia. A cada busca:

1. `StrategySelector.rank_strategies` lê `data/strategy_performance.csv` e
   ordena as estratégias pela **taxa de sucesso suavizada** `(sucessos+1)/(tentativas+2)`.
2. As estratégias são tentadas **nessa ordem** até uma entregar ofertas.
3. Cada tentativa (sucesso ou falha, nº de ofertas, duração) é **gravada** de
   volta no CSV.

Efeitos:

- Estratégias comprovadamente boas sobem e são tentadas primeiro.
- Estratégias **ainda não testadas** têm prior neutro (0.5), então são
  experimentadas antes das que já se mostraram ruins — exploração sem
  aleatoriedade (determinístico e testável).
- Depois de algumas buscas e calibrações, o celest.ia converge para o fluxo
  que dá mais resultado por site, usando os **resultados salvos** — exatamente
  o ciclo de machine learning / self-improvement.

Inspecione o aprendizado com:

```bash
python -m celestia_engine strategies
```

## Configuração relevante (`.env`)

```
FIRECRAWL_API_KEY=...            # habilita as estratégias firecrawl_*
FIRECRAWL_INTERACT=1             # liga/desliga o modo Interact
FIRECRAWL_API_BASE=https://api.firecrawl.dev
COPA_INTERACT_URL=https://www.copaair.com/pt-br/
LATAM_INTERACT_URL=https://www.latamairlines.com/br/pt
USD_BRL_RATE=5.40               # conversão quando o site cota em USD
SCRAPE_STRATEGIES=firecrawl_interact,firecrawl_scrape,playwright_local
STRATEGY_CSV=data/strategy_performance.csv
```
