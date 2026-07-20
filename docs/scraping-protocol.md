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

O último passo pede o JSON estruturado. A extração vai **muito além do preço** —
para cada voo: `airline`/`airline_iata`, `flight_numbers`, `cabin`, `fare_brand`,
`price` + `currency`, `price_miles`, `taxes`, `departure_time`/`arrival_time`
(+`arrival_day_offset`), `duration_minutes`, `stops`, `layovers[]` (aeroporto +
minutos), `aircraft`, `baggage` e `seats_left`. O parser converte **USD → BRL**
(`USD_BRL_RATE`), mapeia rótulos de companhia (COPA, Avianca, LATAM…) para IATA
e mantém uma oferta que tenha preço em **dinheiro OU em milhas**.

## Scripts (playbooks) do Interact

Cada fluxo do Interact é um **script nomeado e reutilizável** em
`providers/firecrawl_scripts.py` (passos + extração rica). A IA orquestradora
enumera os scripts, testa qual rende mais por site e grava o desempenho no CSV
de self-improvement.

| script | tipo | alvo | o que faz |
|---|---|---|---|
| `copa_direct` | offers | copaair.com | busca direto na Copa (dinheiro **e** ConnectMiles) |
| `latam_direct` | offers | latamairlines.com | busca direto na LATAM (dinheiro **e** LATAM Pass) |
| `google_flights_search` | offers | google.com/travel/flights | metasearch: voos de **várias** companhias de uma vez |
| `google_flights_calendar` | calendar | google.com/travel/flights | varre o calendário de preços p/ cortar datas caras |

Liste-os e veja as URLs-alvo com:

```bash
python -m celestia_engine scripts
```

`scrape_flights` (usado pela estratégia `firecrawl_interact` da Copa/LATAM) e
`scan_calendar` (usado pelo flex-date scout) delegam para esses scripts, então
há **uma única fonte de verdade** por fluxo.

## Escada de resultados (garantia nunca-vazio)

**Diretriz:** o sistema não julga se um voo "vale a pena" — ele sempre entrega
o mais barato que alguma fonte devolveu, e o usuário **nunca** sai de mãos
vazias. A única limpeza é a auditoria (duplicatas e preços inválidos ≤ 0).

1. **Ofertas raspadas** (Copa/LATAM via estratégias) — reserváveis, dados
   ricos, alimentam as 4 estratégias de compra.
2. **Cotações do pré-filtro** (Google Flights/Skyscanner) — quando o scraping
   não devolve nada, viram cards de *tarifa indicativa* com link de reserva.
3. **`lastResort`** — se NENHUMA fonte respondeu com preço, a API devolve o
   link da busca já montada no Google Flights para o mesmo par/data, e o site
   mostra o botão "Abrir busca pronta no Google Flights" no lugar do vazio.

## Pré-varredura do calendário (flexibilidade de datas)

Antes de gastar scraping caro em cada data, o **FlexDateScoutAgent**
(`agents/flex_scout.py`) corta as datas caras usando o **calendário de preços
do Google Flights**. Quando o pedido traz `flexibility.enabled`:

1. Resolve a janela a varrer a partir do preset — `1w`=±7, `2w`=±14, `3w`=±21,
   `1m`=±30 dias ao redor da ida — ou de um período personalizado
   (`custom` com `window_start`/`window_end`).
2. Uma **única sessão Interact** abre o Google Flights, define somente-ida,
   rota e classe, abre o seletor de datas e lê o preço de cada data da janela
   (`firecrawl_interact.scan_calendar` → `parse_calendar_output`, com a mesma
   conversão USD → BRL).
3. O scout devolve apenas as `flex_max_dates` datas **mais baratas**; são as
   únicas que seguem para o scraping caro. Assim, uma janela de 1 mês (~61
   datas) vira 5 candidatas antes de qualquer token de scraping ser gasto.
4. Se o calendário não puder ser lido (sem Firecrawl, erro, vazio), degrada
   para uma amostragem simétrica da janela — **nunca** derruba a busca.

O botão **"Tenho flexibilidade nas datas"** no frontend (`FlexibilityToggle`)
expõe exatamente esses presets (1, 2, 3 semanas, 1 mês, ou "Selecionar outro
período"). Pela CLI:

```bash
python -m celestia_engine search GRU MCO --depart 2026-09-20 --flex-weeks 2
python -m celestia_engine search GRU MCO --depart 2026-09-20 \
    --flex-window 2026-09-01 2026-10-15 --flex-max-dates 6
```

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

### Memória de falhas por rota

Além do placar por site, cada desfecho por **(site, estratégia, rota)** — com o
texto do erro — vai para `data/search_failures.csv`. Estratégias com
**3 falhas seguidas naquela rota** são rebaixadas para o fim da fila na
próxima busca (nunca banidas: seguem como último recurso, e um sucesso zera a
sequência). O sistema não repete primeiro o que acabou de falhar.

### Malha de companhias que cresce sozinha

O registro curado (`celestia_engine/airlines.py`, ~28 companhias com nome,
programa de milhas e deep-link de reserva) resolve rótulos do metasearch para
IATA e alimenta o botão **"Ver oferta"** (link capturado pelo Firecrawl →
deep-link da companhia → busca no Google Flights, nunca vazio). Companhias
inéditas que aparecerem em qualquer busca são gravadas em
`data/airlines_discovered.csv` — a malha conhecida se expande com o uso.

## Configuração relevante (`.env`)

```
FIRECRAWL_API_KEY=...            # habilita as estratégias firecrawl_*
FIRECRAWL_INTERACT=1             # liga/desliga o modo Interact
FIRECRAWL_API_BASE=https://api.firecrawl.dev
COPA_INTERACT_URL=https://www.copaair.com/pt-br/
LATAM_INTERACT_URL=https://www.latamairlines.com/br/pt
GOOGLE_FLIGHTS_INTERACT_URL=https://www.google.com/travel/flights?hl=pt-BR&curr=BRL
USD_BRL_RATE=5.40               # conversão quando o site cota em USD
SCRAPE_STRATEGIES=firecrawl_interact,firecrawl_scrape,playwright_local
STRATEGY_CSV=data/strategy_performance.csv
```
