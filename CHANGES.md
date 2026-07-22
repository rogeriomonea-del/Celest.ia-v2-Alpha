# CHANGES — Integração final + Multidestinos

Registro das mudanças da missão "integração end-to-end + multidestinos"
sobre o design **Nebula Cartography**. A busca simples (`POST /api/search`)
permanece **byte-compatível** — todo o multidestinos é aditivo.

> **Os valores multidestinos são combinações de trechos independentes. Não
> representam necessariamente uma tarifa única, PNR único ou conexões
> protegidas.**

## Motor (`celestia_engine/`)

- **`agents/multicity.py` (novo)** — `MultiCityOrchestrator`: compõe um
  `Orchestrator` por trecho com semáforo global **compartilhado**, no máximo
  2 trechos concorrentes, orçamento global de scraping dividido por trecho,
  timeout por trecho e global, logs `[trecho N ORI→DES]`, duração wall-clock
  e ordem dos trechos preservada. Erros por trecho com códigos estáveis
  (`LEG_TIMEOUT`, `LEG_SEARCH_FAILED`, `MULTICITY_TIMEOUT`) — sem mock
  mascarando erro real. Combinações por **beam search** (top 5 escolhas por
  trecho, dedupe por (oferta, estratégia), ≤ 20 itinerários, ids
  determinísticos, ordenação estável, `milesShortfall` calculado uma vez,
  escolha sintética apenas com tarifa indicativa quando um trecho não tem
  opções calculadas).
- **`api.py`** — endpoint aditivo `POST /api/search/multi-city` com validação
  estrita e códigos estáveis (`INVALID_LEG_COUNT`, `INVALID_IATA`,
  `SAME_AIRPORT`, `DATES_OUT_OF_ORDER`, `DUPLICATE_LEG`); semântica
  HTTP 200 (inclusive parcial) / 422 / 502 / 504 com `lastResort` por trecho;
  `capabilities` em `GET /api/status`
  (`{multiCity, maxMultiCityLegs, multiCityPricingScope}`); `passengers`
  agora propagado aos links de reserva; validação IATA restrita a ASCII
  (também na busca simples — "SÃO" era aceito).
- **`agents/orchestrator.py`** — teto opcional de scraping
  (`scrape_hard_cap`) cobrindo inclusive o caminho **sem pré-filtro**;
  busca simples permanece sem teto (0 = desligado).
- **`config.py` / `.env.example`** — `MULTICITY_MAX_LEGS`,
  `MULTICITY_MAX_CONCURRENT_LEGS`, `MULTICITY_MAX_SCRAPES`,
  `MULTICITY_TOP_CHOICES_PER_LEG`, `MULTICITY_MAX_ITINERARIES`,
  `MULTICITY_SEARCH_TIMEOUT_S`.
- **`tests/test_multicity.py` (novo)** — 19 testes: contrato congelado da
  busca simples, capabilities, validação (todos os códigos), open-jaw,
  ida-e-volta como jornada, determinismo do mock, beam search e somas,
  semáforo compartilhado + orçamento, parcial/total/timeout, sanitização de
  URLs. Suíte completa: **140 testes**.

## Site (`celestia_dashboard/`)

- **`src/api.ts`** — única camada que fala com o motor: contratos
  `EngineMultiCity*`, `searchJourney()` (uma chamada HTTP; fan-out é do
  motor), timeout de 620 s (> 600 s do motor), 404 → "o motor conectado
  ainda não suporta multidestinos", flexibilidade do 1º trecho recortada
  para a véspera do trecho seguinte, mapeamento para tipos de apresentação.
- **`src/types.ts`** — `TripType + 'multicity'`, `SearchLeg`, tipos de
  apresentação da jornada (`LegView`, `JourneyItinerary`, `JourneyResult`…).
- **`src/components/SearchBar.tsx`** — modo **Multidestinos**: 2–6 linhas de
  trecho (origem/destino/data), adicionar (pré-preenche a origem seguinte),
  remover, reordenar, open-jaw editável, validação client-side espelhando o
  motor (mensagens pt-BR).
- **`src/App.tsx`** — visão consolidada da jornada: aviso honesto
  (modo/parcial/disclaimer), painel **Melhores combinações** (chips por
  trecho com link de reserva), abas por trecho com status, resultados e
  filtros/ordenação **por trecho** (trocar de aba não destrói o estado dos
  outros), erro por trecho com código + `lastResort`, respostas obsoletas
  nunca sobrescrevem buscas mais novas; demo local determinística no modo
  `off`. **Correção do ida-e-volta**: a volta agora é pesquisada de fato
  (jornada de 2 trechos internamente); `/api/search` segue intacto para
  somente-ida.
- **`src/components/NebulaGlobe.tsx`** — o globo do hero representa **todos
  os trechos** da jornada com arcos leves em SVG, destacando o trecho
  selecionado (avião, pulsos e rótulos seguem o trecho ativo; trechos de
  retorno curvam para o lado oposto).
- **`src/components/LiveIntelligence.tsx`** — cartão ciente da jornada com
  dados reais do motor: trechos ok/total, cenários analisados, combinações;
  confiança "Parcial" quando houve falha parcial.

## Documentação

- `docs/multicity-contract.md` (novo) — contrato completo do endpoint.
- `README.md` — seção multidestinos + variáveis de ambiente.
- `.env.example` — bloco `MULTICITY_*` comentado com o disclaimer.
