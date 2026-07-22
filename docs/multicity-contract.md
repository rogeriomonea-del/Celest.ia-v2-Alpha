# Contrato da API — Multidestinos (`POST /api/search/multi-city`)

Busca uma **jornada de 2 a 6 trechos sequenciais** (open-jaw permitido, datas
estritamente crescentes). Cada trecho é pesquisado pelo mesmo motor da busca
simples; o resultado agrega os trechos e calcula as melhores combinações.

> **Os valores multidestinos são combinações de trechos independentes. Não
> representam necessariamente uma tarifa única, PNR único ou conexões
> protegidas.**

A capacidade é anunciada em `GET /api/status`:

```json
"capabilities": { "multiCity": true, "maxMultiCityLegs": 6, "multiCityPricingScope": "independentLegs" }
```

## Requisição

```json
{
  "legs": [
    { "origin": "GRU", "destination": "LIS", "departDate": "2026-09-15" },
    { "origin": "LIS", "destination": "CDG", "departDate": "2026-09-20" },
    { "origin": "CDG", "destination": "GRU", "departDate": "2026-09-29" }
  ],
  "cabin": "business",          // economy | premium | business (opcional)
  "passengers": 2,               // 1..9 (opcional, padrão 1)
  "milesProgram": "latampass",  // opcional
  "milesBalance": 120000,        // opcional
  "flexibility": {               // opcional — aplicada ao 1º trecho e recortada
    "enabled": true,             // para nunca ultrapassar a data do trecho 2
    "preset": "1w",             // 1w | 2w | 3w | 1m | custom
    "windowStart": null,         // exigidos quando preset = custom
    "windowEnd": null
  }
}
```

Campos extras são rejeitados (`extra="forbid"`); `returnDate` **não existe**
aqui — a volta é apenas mais um trecho.

## Validação (HTTP 422, corpo `{"code", "message"}`)

| Código | Quando |
|---|---|
| `INVALID_LEG_COUNT` | menos de 2 ou mais de `maxMultiCityLegs` trechos |
| `INVALID_IATA` | origem/destino que não é IATA ASCII de 3 letras |
| `SAME_AIRPORT` | origem == destino no mesmo trecho |
| `DATES_OUT_OF_ORDER` | datas fora de ordem estritamente crescente (ou não-ISO) |
| `DUPLICATE_LEG` | dois trechos idênticos (origem+destino+data) |

## Sucesso — HTTP 200

```json
{
  "searchType": "multiCity",
  "mode": "mock" | "real",
  "pricingScope": "independentLegs",
  "partial": false,
  "legs": [
    {
      "legIndex": 0, "origin": "GRU", "destination": "LIS",
      "requestedDepart": "2026-09-15",
      "status": "ok" | "empty" | "failed" | "timeout",
      "error": null,
      "mode": "mock", "flights": [...], "lastResort": {...},
      "options": [...], "quotes": [...], "stats": {...}, "agentLog": [...]
    }
  ],
  "itineraries": [
    {
      "id": "a1b2c3d4e5f6", "rank": 1, "priceBasis": "perPassenger",
      "selections": [
        { "legIndex": 0, "flightId": "...", "optionKey": "...", "strategy": "cash_direct", "bookingUrl": "..." }
      ],
      "cashBrl": 5100.0, "miles": 0, "effectiveTotalBrl": 5592.4,
      "milesShortfall": 0,
      "notes": ["Combinação de trechos reservados separadamente — ..."]
    }
  ],
  "stats": { "...somas dos trechos", "legsTotal": 3, "legsSucceeded": 3, "legsEmpty": 0, "legsFailed": 0, "durationSeconds": 1.2 },
  "agentLog": ["[trecho 1 GRU→LIS] ..."]
}
```

- Cada `legs[i]` tem o **mesmo formato** da resposta da busca simples
  (`/api/search`) mais os metadados do trecho.
- `itineraries` são até `MULTICITY_MAX_ITINERARIES` combinações (beam search
  sobre as `MULTICITY_TOP_CHOICES_PER_LEG` melhores escolhas de cada trecho),
  ordenadas por custo efetivo total; preços **por passageiro**;
  `milesShortfall` calculado uma única vez sobre o total da jornada.

## Parcial — HTTP 200 com `partial: true`

Se ao menos um trecho respondeu e outro falhou/expirou, a resposta continua
200: o trecho com problema vem com `status: "failed" | "timeout"`, um `error`
`{code, message, retriable}` (`LEG_SEARCH_FAILED`, `LEG_TIMEOUT`) e o
`lastResort` (link Google Flights pronto) — os demais trechos vêm completos.
Sem todos os trechos não há `itineraries`.

## Falha total

- **HTTP 502** — nenhum trecho respondeu; corpo estruturado com o diagnóstico
  por trecho (código + mensagem + `lastResort` de cada um).
- **HTTP 504** — todos os trechos expiraram (`LEG_TIMEOUT`) ou o teto global
  `MULTICITY_SEARCH_TIMEOUT_S` foi atingido (`MULTICITY_TIMEOUT`).

## Orquestração e custos

- No máximo `MULTICITY_MAX_CONCURRENT_LEGS` (2) trechos pesquisam em paralelo;
  todos os subagentes compartilham **um único** semáforo global
  (`MAX_SUBAGENTS`) — a jornada não multiplica o paralelismo.
- Orçamento global de scraping: `MULTICITY_MAX_SCRAPES` dividido entre os
  trechos (vale também no caminho sem pré-filtro).
- Timeout por trecho (`API_SEARCH_TIMEOUT_S`) e global
  (`MULTICITY_SEARCH_TIMEOUT_S`).

## Limitações conhecidas

- Preços por trecho independentes: sem tarifa combinada de ida-e-volta, sem
  through-fares, sem proteção de conexão entre trechos.
- `flexibility` só é aplicada ao 1º trecho (recortada para nunca alcançar a
  data do trecho seguinte) — os demais usam a data pedida.
- Combinações não deduplicam voos entre trechos (um mesmo número de voo pode
  aparecer em trechos diferentes se as datas permitirem).
- Saldo de milhas é comparado ao total da jornada — não há alocação ótima de
  milhas por trecho.
