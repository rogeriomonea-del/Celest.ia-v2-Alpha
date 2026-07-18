# celest.ia — Plataforma de pesquisa inteligente de voos

Duas peças principais:

| Peça | Pasta | Stack |
|---|---|---|
| **Engine multi-agente** (busca, scraping, milhas) | `celestia_engine/` | Python 3.11 + asyncio + Playwright |
| **Front-end de busca** (estilo Kayak/Google Flights) | `celestia_dashboard/` | React + TypeScript + Tailwind |

## Arquitetura do engine

```text
                 ┌──────────────────────┐
    pedido ────► │   Orchestrator       │  planeja candidatos (rota × data,
                 │  (agente comandante) │  conexões via hub, flexibilidade)
                 └──────────┬───────────┘
                            │ gera subagentes (semáforo MAX_SUBAGENTS)
        ┌───────────────────┼──────────────────────┐
        ▼                   ▼                      ▼
┌───────────────┐   ┌──────────────────┐   ┌───────────────────┐
│ PriceScout    │   │ CopaScraper      │   │ LatamScraper      │
│ Google Flights│   │ Firecrawl →      │   │ Firecrawl →       │
│ + Skyscanner  │   │ Playwright local │   │ Playwright local  │
│ (PRÉ-FILTRO)  │   │ (ConnectMiles)   │   │ (LATAM Pass)      │
└───────┬───────┘   └────────┬─────────┘   └─────────┬─────────┘
        │ top-K mais baratos │ ofertas cash + award  │
        └───────────────┬────┴───────────────────────┘
                        ▼
              ┌───────────────────┐
              │  MilesMathAgent   │  4 estratégias + milheiro
              └─────────┬─────────┘
                        ▼
              Relatório ranqueado (SearchReport)
```

* **Pré-filtro** — Google Flights/Skyscanner são consultados primeiro (baratos);
  apenas os `PREFILTER_TOP_K` candidatos mais baratos seguem para o scraping
  com browser (caro). O relatório mostra quantos scrapes foram economizados.
* **Rotas** — malha curada de Copa (hub PTY, conexões automáticas via PTY),
  LATAM (troncos BR + internacionais, conexões via GRU/SCL/LIM) e as rotas
  populares cobertas via Skyscanner: `python -m celestia_engine routes`.
* **MilesMathAgent** — agente dedicado ao cálculo de compra:
  1. **Executiva direto** (dinheiro)
  2. **Econômica + upgrade com milhas**
  3. **Emissão em milhas** (award + taxas)
  4. **Econômica + upgrade em dinheiro**

  Para cada opção com milhas ele mostra o **equivalente em reais** pelo
  milheiro configurado e o **milheiro de equilíbrio** (abaixo desse valor,
  a estratégia com milhas vence a melhor opção em dinheiro).

## Como rodar

```bash
pip install -r requirements.txt
playwright install chromium          # só para scraping real
cp .env.example .env                 # preencha suas chaves (ver abaixo)

# demo offline (sem chaves, dados determinísticos)
CELESTIA_MOCK=1 python -m celestia_engine search GRU MIA --depart 2026-09-10 --flex 1

# busca real
python -m celestia_engine search GRU PTY --depart 2026-09-10 \
    --cabin business --miles-balance 120000 --program connectmiles --flex 2

python -m celestia_engine routes     # malha carregada
python -m celestia_engine milheiro   # tabela de milheiro
python -m pytest                     # 27 testes offline
```

## Chaves de API — o que conectar e onde

Todas as chaves vão no arquivo **`.env` na raiz** (copie de `.env.example`).

| Variável | Serviço | Onde obter | Para quê |
|---|---|---|---|
| `SERPAPI_KEY` | SerpApi (Google Flights) | https://serpapi.com | Pré-filtro de preços |
| `SKYSCANNER_API_KEY` | Skyscanner Partners v3 | https://developers.skyscanner.net | Pré-filtro + descoberta de rotas |
| `RAPIDAPI_KEY` | RapidAPI (fallback Skyscanner) | https://rapidapi.com | Alternativa sem aprovação de parceiro |
| `FIRECRAWL_API_KEY` | Firecrawl (scraping gerenciado) | https://firecrawl.dev | Copa/LATAM com anti-bot gerenciado; Playwright local vira fallback |
| `COPA_BOOKING_URL` / `LATAM_OFFERS_URL` | — | — | Ajustar templates se os sites mudarem |
| `MILHEIRO_*` | — | — | Valor que você paga por 1.000 milhas |
| `PREFILTER_TOP_K` / `MAX_SUBAGENTS` | — | — | Custo × velocidade da pesquisa |

Sem nenhuma chave o engine continua funcionando: pula o pré-filtro e raspa
todos os candidatos (mais caro), ou roda 100% offline com `CELESTIA_MOCK=1`.

> **Aviso**: scraping de sites de companhias aéreas está sujeito aos termos de
> uso de cada site e a proteções anti-bot. Use com moderação, prefira as APIs
> oficiais quando disponíveis e monitore falhas no log de agentes.

## Front-end (`celestia_dashboard/`)

SPA de busca de voos com typeahead IATA, calendário duplo, popover de
passageiros, abas Melhor/Mais barato/Mais rápido, filtros funcionais e
skeleton loaders. Deploy automático no Vercel (ver `vercel.json`).

```bash
cd celestia_dashboard && npm install && npm run dev
```

## Módulos legados

`scrapers.py` e `research_planner.py` são o protótipo original (mantidos
pelos testes históricos). A funcionalidade deles foi absorvida e superada
pelo `celestia_engine/`.
