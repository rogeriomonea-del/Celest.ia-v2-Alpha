# DEPLOY — backend real para o painel (sem modo demonstração)

Este guia coloca a API do Investment Intelligence OS no ar com dados reais
das fontes oficiais (Tesouro Transparente, CVM, B3, BCB) e aponta o painel
(`Celst.ia-Finance`) para ela — o modo demonstração fica desligado.

## Visão geral

```
fontes oficiais ──(cli ingest/build/macro)──▶ data/ (bronze→silver→gold)
                                              │
                                   uvicorn investment_os.api.main:app
                                              │  /v1/* (JSON com fonte+data-base)
painel Next.js (Celst.ia-Finance) ────────────┘
  NEXT_PUBLIC_IIOS_API_URL=<url da API>   (SEM NEXT_PUBLIC_IIOS_DEMO)
```

A API é stateless exceto por `data/`: os artefatos gold (JSON/parquet) e o
`data/portfolio.db` (SQLite da Fase 5 — perfil, IPS, snapshots). Persistir o
diretório `data/` é persistir o sistema inteiro.

## Opção A — máquina local (dev)

```bash
pip install -r requirements.txt
python -m investment_os.cli all          # ingestão + build + macro + report (D-1)
uvicorn investment_os.api.main:app       # http://localhost:8000
# painel: npm run dev no repo Celst.ia-Finance (localhost:3000 já liberado no CORS)
```

## Opção B — Docker (recomendada para uso contínuo)

```bash
docker compose run --rm pipeline   # popula/atualiza data/ com dados oficiais D-1
docker compose up -d api           # API em http://<host>:8000
```

- `./data` é montado como volume: gold + portfolio.db sobrevivem a rebuilds.
- Variáveis via `.env` (ver `.env.example`); nenhum secret é obrigatório.
- Atualização diária (D-1): agende o serviço `pipeline` num cron do host, ex.:
  `10 7 * * 1-5 cd /opt/celestia && docker compose run --rm pipeline`
  (as fontes oficiais publicam em D-1/EOD — "tempo real" não existe, ADR-0006).

## Opção C — host gerenciado (Render, Railway, Fly.io, VPS)

Qualquer host que rode um container serve. Requisitos:

1. **Build**: usar o `Dockerfile` da raiz (porta 8000).
2. **Disco persistente** montado em `/app/data` (gold + SQLite). Sem disco
   persistente, a Fase 5 (perfil/IPS/carteira) perde os dados a cada deploy.
3. **Pipeline**: rodar `python -m investment_os.cli all` no primeiro deploy e
   agendado (cron/job diário) para dados D-1.
4. **Env**:
   - `IIOS_CORS_ORIGINS=https://<painel>.vercel.app` (origem do painel);
   - `ANTHROPIC_API_KEY` (opcional — habilita `/v1/chat`);
   - `IIOS_BRAPI_TOKEN` (opcional — intradiário indicativo, ADR-0006).

> Serverless (ex.: Vercel Functions) NÃO é adequado para esta API: o SQLite
> da Fase 5 exige disco persistente e o pipeline roda minutos — use um host
> com processo/disco de longa duração.

## Apontando o painel (desligando o modo demonstração)

No repo `Celst.ia-Finance` (ver também `docs/INTEGRATION.md`):

```bash
# .env.local (dev) ou variável de ambiente do host do painel
NEXT_PUBLIC_IIOS_API_URL=https://api.exemplo.com   # URL pública da API
# NEXT_PUBLIC_IIOS_DEMO — NÃO definir (qualquer valor ≠ "1" também desliga)
```

- O modo demonstração só liga com `NEXT_PUBLIC_IIOS_DEMO=1` explícito no
  build; sem a variável, o painel fala exclusivamente com a API real.
- A prévia vendorizada `painel_demo/` (branch do PR #10) é DESCARTÁVEL: com
  backend hospedado, rebuilde o painel com `NEXT_PUBLIC_IIOS_API_URL`
  apontando para ele e sem a flag de demo, e adicione a origem do painel em
  `IIOS_CORS_ORIGINS` na API.

## Segurança (antes de expor publicamente)

- A API ainda NÃO tem autenticação (contrato prevê Bearer; implementação em
  fase de produção). Exponha apenas: (a) em rede privada/VPN; (b) atrás de um
  proxy com autenticação (Basic/OAuth de borda); ou (c) para uso pessoal com
  firewall restringindo origem. Os dados da Fase 5 são financeiros pessoais.
- Secrets somente via env; nunca commitar `.env` (regra do CLAUDE.md).
- CORS: liste origens exatas em `IIOS_CORS_ORIGINS`; não use curinga.

## Verificação pós-deploy

```bash
curl https://<api>/health                     # {"status":"ok",...}
curl https://<api>/v1/overview | head -c 300  # blocos com fonte e data-base
```

No painel: cada tela mostra o selo "API" (não "DEMONSTRAÇÃO") e a URL da API
no rodapé do cabeçalho da página.
