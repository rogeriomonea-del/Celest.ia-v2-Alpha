# Celest.ia — plano de go-live (v1)

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Fonte de voos | **Duffel API** (REST, `Duffel-Version: v2`) via funções serverless | Amadeus Self-Service foi desligado em 17/07/2026; Duffel tem ofertas reais, modo teste gratuito (`duffel_test_…`) e cobra só por pedido emitido. Scrapers (`scrapers.py`) não são viáveis (sites JS + anti-bot + ToS). |
| Login | **Supabase Auth** com OAuth **Google** e **Apple** | SDK no browser, sem servidor de sessão; Postgres com RLS para dados por usuário. |
| Dados por usuário | Tabela `saved_searches` no Supabase, RLS `auth.uid() = user_id` | Dá função concreta ao login sem backend extra. |
| Backend | Funções Vercel em `celestia_dashboard/api/*` (Node, ESM), lógica em `celestia_dashboard/server/*` | Mesmo deploy do front; chave Duffel fica só no servidor. |
| Projeto Vercel canônico | `celestiadashboard` (Root Directory = `celestia_dashboard`) | As funções `api/` precisam estar na raiz do projeto Vercel. |
| Busca | Pública (sem login). Salvar busca exige login. | Menos atrito; Duffel não cobra por busca. |
| Reserva | **Fora da v1.** "Ver oferta" re-consulta a oferta (preço atual, condições, validade). | Emissão envolve pagamento/PCI — fase 2 (Duffel Links ou Orders API). |
| Milhas | **Fora da v1.** | Precisa de fonte de disponibilidade award (ex.: seats.aero) — fase 2. |

## Contrato HTTP

Definido em `celestia_dashboard/src/shared/api.ts` (tipos + validação zod usada pelos dois lados).

- `POST /api/flights/search` → `SearchResponse { offers: Flight[], searchedAt }`
- `GET /api/places?q=` → `PlacesResponse { places: Airport[] }`
- `GET /api/offers/:id` → `OfferResponse { offer: Flight }`
- Erros: `ApiErrorBody { error: { code, message } }` com mensagem pt-BR.

## Variáveis de ambiente

| Nome | Onde | Uso |
|---|---|---|
| `DUFFEL_ACCESS_TOKEN` | Vercel (server) | Token Duffel (`duffel_test_…` em preview, `duffel_live_…` em produção) |
| `VITE_SUPABASE_URL` | Vercel (build) | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Vercel (build) | Chave pública (anon/publishable) do Supabase |

## Fases

1. Base: contrato, tipos, vitest, configs. ✅
2. Em paralelo: (A) API Duffel · (B) Auth + buscas salvas · (D) infra (CI, headers, README).
3. (C) Front ligado na API real, mock removido, "Ver oferta" real.
4. Revisão independente + correções.
5. Configuração externa (dono da conta) → deploy.

## Configuração externa (precisa do dono da conta)

1. **Duffel**: criar conta em duffel.com → gerar token de teste → `DUFFEL_ACCESS_TOKEN` na Vercel. Para preços reais: ativar conta live.
2. **Supabase**: criar projeto → rodar `supabase/migrations/*.sql` (SQL Editor) → copiar URL e anon key para a Vercel.
3. **Google OAuth**: Google Cloud Console → OAuth client (Web) → redirect `https://<projeto>.supabase.co/auth/v1/callback` → colar client id/secret em Supabase → Auth → Providers → Google.
4. **Apple**: Apple Developer (US$ 99/ano) → Services ID + chave Sign in with Apple → mesmo callback → Supabase → Providers → Apple.
5. **Supabase → Auth → URL Configuration**: Site URL = domínio de produção; adicionar domínios de preview em Redirect URLs.
6. **Vercel**: desativar a "Vercel Authentication" (SSO) do deploy de produção ou usar domínio próprio; escolher um único projeto (recomendado `celestiadashboard`).
