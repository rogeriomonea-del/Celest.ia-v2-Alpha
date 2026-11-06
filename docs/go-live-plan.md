# Celest.ia — plano de go-live (v1)

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Fonte de voos | **Duffel API** (REST, `Duffel-Version: v2`) via funções serverless | Amadeus Self-Service foi desligado em 17/07/2026; Duffel tem ofertas reais, modo teste gratuito (`duffel_test_…`) e cobra principalmente por pedido emitido (ver ressalva sobre buscas abaixo). Scrapers (`scrapers.py`) não são viáveis (sites JS + anti-bot + ToS). |
| Login | **Supabase Auth** com OAuth **Google** e **Apple** | SDK no browser, sem servidor de sessão; Postgres com RLS para dados por usuário. |
| Dados por usuário | Tabela `saved_searches` no Supabase, RLS `auth.uid() = user_id` | Dá função concreta ao login sem backend extra. |
| Backend | Funções Vercel em `celestia_dashboard/api/*` (Node, ESM), lógica em `celestia_dashboard/server/*` | Mesmo deploy do front; chave Duffel fica só no servidor. |
| Projeto Vercel canônico | `celestiadashboard` (Root Directory = `celestia_dashboard`) | As funções `api/` precisam estar na raiz do projeto Vercel. |
| Busca | Pública (sem login). Salvar busca exige login. | Menos atrito. **Atenção:** a Duffel pode cobrar por buscas em excesso em relação ao número de pedidos emitidos — confirmar na página de preços da Duffel antes do go-live; o rate limit (abaixo) limita o custo. |
| Reserva | **Fora da v1.** "Ver oferta" re-consulta a oferta (preço atual, condições, validade). | Emissão envolve pagamento/PCI — fase 2 (Duffel Links ou Orders API). |
| Milhas | **Na v1, sem scraping.** Módulo de milhas sobre os preços da Duffel: equivalente em milhas pelo milheiro do programa, award real via **seats.aero** (Smiles, TudoAzul, ConnectMiles e programas internacionais; LATAM Pass não é coberto), custo efetivo e milheiro de equilíbrio. | É a matemática do `engine/` (calculadora de compra) portada para TS com os bugs corrigidos. Award por scraping foi descartado (ToS/anti-bot). |
| Motor Python (`engine/`) | **Guardado, desligado.** Importado no repo com bugs confirmados corrigidos, testes offline e CI; não é usado pelo site. | Scraping de companhias/Google Flights é frágil e contra os termos de uso; fica disponível para pesquisa manual (`CELESTIA_MOCK=1 python -m celestia_engine …`). |

## Contrato HTTP

Definido em `celestia_dashboard/src/shared/api.ts` (tipos + validação zod usada pelos dois lados).

- `POST /api/flights/search` → `SearchResponse { offers: Flight[], totalOffers, truncated, liveMode, searchedAt, miles }` (até 60 ofertas, preservando as mais baratas, as mais rápidas, cada faixa de escalas e cada companhia). Com `miles: { program, milheiroBrl, balance }` no pedido, cada oferta traz `miles: { equivalentMiles, award, options[] }` e a resposta ecoa `miles: MilesSummary`.
- `GET /api/places?q=` → `PlacesResponse { places: Airport[] }`
- `GET /api/offers/:id` → `OfferResponse { offer: Flight, liveMode }`
- Erros: `ApiErrorBody { error: { code, message } }` com mensagem pt-BR.

## Variáveis de ambiente

| Nome | Onde | Uso |
|---|---|---|
| `DUFFEL_ACCESS_TOKEN` | Vercel (server) | Token Duffel (`duffel_test_…` em preview, `duffel_live_…` em produção) |
| `VITE_SUPABASE_URL` | Vercel (build) | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Vercel (build) | Chave pública (anon/publishable) do Supabase |
| `SEATS_AERO_API_KEY` | Vercel (server) | Chave do Partner API do seats.aero para consulta de awards (opcional: sem ela o módulo de milhas mostra só o equivalente em milhas) |

## Fases

1. Base: contrato, tipos, vitest, configs. ✅
2. ✅ Em paralelo: (A) API Duffel · (B) Auth + buscas salvas · (D) infra (CI, headers, README).
3. ✅ (C) Front ligado na API real, mock removido, "Ver oferta" real.
4. ✅ Revisão independente + correções.
5. ✅ Módulo de milhas (contrato, matemática no servidor, UI, motor guardado) + provedor seats.aero.
6. Configuração externa (dono da conta) → deploy.

## Configuração externa (precisa do dono da conta)

1. **Duffel**: criar conta em duffel.com → gerar token de teste → `DUFFEL_ACCESS_TOKEN` na Vercel. Para preços reais: ativar conta live.
2. **Supabase**: criar projeto → rodar `supabase/migrations/*.sql` (SQL Editor) → copiar URL e anon key para a Vercel.
3. **Google OAuth**: Google Cloud Console → OAuth client (Web) → redirect `https://<projeto>.supabase.co/auth/v1/callback` → colar client id/secret em Supabase → Auth → Providers → Google.
4. **Apple**: Apple Developer (US$ 99/ano) → Services ID + chave Sign in with Apple → mesmo callback → Supabase → Providers → Apple.
5. **Supabase → Auth → URL Configuration**: Site URL = domínio de produção; adicionar domínios de preview em Redirect URLs.
6. **Rate limiting**: na Vercel → Firewall, criar uma regra de rate limit (ex.: 10 req/min por IP) para `/api/flights/search` e `/api/offers/*`, respondendo 429. Protege a cota/custo da Duffel contra abuso, já que a busca é pública.
7. **Vercel**: desativar a "Vercel Authentication" (SSO) do deploy de produção ou usar domínio próprio; escolher um único projeto (recomendado `celestiadashboard`).
8. **seats.aero** (awards): conta Pro (US$ 9,99/mês) → Settings → API → gerar a chave → `SEATS_AERO_API_KEY` na Vercel. Limite de 1.000 chamadas/dia por chave. **A chave Pro é só para uso pessoal/não comercial**: para o site público, pedir acordo comercial a `support@seats.aero` (e-mail corporativo + caso de uso), ou, como alternativa, implementar "Login with Seats.aero" (OAuth: cada usuário conecta a própria conta Pro e usa a própria cota) — fase 2.
