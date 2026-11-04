# Celest.ia

Busca de voos com ofertas reais. O usuário pesquisa sem login; para salvar
buscas, entra com Google ou Apple.

- **Busca de voos real** via [Duffel](https://duffel.com) (aeroportos, ofertas e preços).
- **Login Google/Apple** via Supabase Auth.
- **Buscas salvas** em Postgres (Supabase) com RLS por usuário.
- Fora da v1: reserva/pagamento e programas de milhas.

## Arquitetura

```text
Navegador (SPA Vite + React)
   |
   |-- /api/*  --> Funções Vercel (celestia_dashboard/api) --> Duffel API
   |                 (token DUFFEL_ACCESS_TOKEN só no servidor)
   |
   `-- Supabase Auth (Google/Apple) e Supabase DB (saved_searches, RLS)
```

## Projeto Vercel canônico

O projeto canônico é **`celestiadashboard`**, com **Root Directory =
`celestia_dashboard`**. As funções em `api/` precisam estar na raiz do projeto
Vercel, por isso o diretório raiz do projeto tem de ser `celestia_dashboard`
(configuração em `celestia_dashboard/vercel.json`).

O `vercel.json` da raiz do repositório pertence a um segundo projeto Vercel,
**`celest-ia`**, que usa a raiz do repo: ele só publica o front-end estático e
**não serve `/api`**. Não use esse projeto em produção.

## Estrutura do repositório

```text
.
├── celestia_dashboard/
│   ├── src/                 # SPA (React + TS + Tailwind); src/shared = contrato HTTP (zod)
│   ├── api/                 # funções Vercel (/api/*)
│   ├── server/              # lógica de servidor (cliente Duffel, validação)
│   ├── vercel.json          # build, funções e cabeçalhos de segurança (CSP)
│   └── .env.example
├── supabase/migrations/     # SQL (saved_searches + RLS)
├── docs/go-live-plan.md     # decisões e checklist de go-live
├── tests/                   # testes dos protótipos Python
├── research_planner.py      # protótipo legado
├── scrapers.py              # protótipo legado
└── .github/workflows/ci.yml
```

`research_planner.py` e `scrapers.py` são **protótipos legados, não usados em
produção**. Os scrapers não servem para o produto por causa de renderização
JavaScript, anti-bot e termos de uso das companhias.

## Desenvolvimento local

```bash
cd celestia_dashboard
npm ci
cp .env.example .env.local   # preencha os valores
npm run dev
```

`npm run dev` serve apenas o front-end. As funções `/api` rodam localmente
somente com `vercel dev` (a partir de `celestia_dashboard`).

## Variáveis de ambiente

| Variável | Onde | Descrição |
| --- | --- | --- |
| `DUFFEL_ACCESS_TOKEN` | servidor | Token Duffel (`duffel_test_...` em previews). Nunca no cliente. |
| `VITE_SUPABASE_URL` | cliente | URL do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | cliente | Chave anon pública do Supabase. |

## Testes

```bash
cd celestia_dashboard && npm run typecheck && npm test   # web
pip install -r requirements-dev.txt && pytest -q         # Python (na raiz)
```

O CI (`.github/workflows/ci.yml`) roda os dois conjuntos mais `vite build`.

## Deploy

Siga a seção **"Configuração externa"** de
[`docs/go-live-plan.md`](docs/go-live-plan.md) (Duffel, Supabase, Google/Apple
OAuth, URLs de redirect e ajustes na Vercel).
