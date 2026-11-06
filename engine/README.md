# celestia_engine — motor de pesquisa multi-agente

Motor Python do dono do projeto, guardado aqui para versionamento e testes.

## O que é

Um orquestrador de agentes para pesquisa de passagens:

- **Pré-filtro por metasearch** — cota os candidatos (rota × data) em fontes
  baratas (Google Flights via SerpApi/RapidAPI, Skyscanner) e só leva os mais
  baratos para a etapa cara.
- **Scraping das companhias** — Copa, LATAM, GOL e Azul via Firecrawl
  (Interact e scrape estático) ou Playwright local, com ordem de estratégias
  aprendida a partir do desempenho gravado em CSV.
- **Estratégia de milhas** — custo efetivo (dinheiro + milhas × milheiro do
  programa da oferta), milheiro de equilíbrio por cabine, saldo insuficiente.

## Status

- **NÃO é usado pelo site.** O `celestia_dashboard` não chama este motor.
- **Desligado por padrão.** Sem chaves no ambiente nenhuma API paga é chamada
  e nada é raspado: o scraping só roda com `FIRECRAWL_API_KEY` definida ou com
  o extra Playwright instalado, e `SCRAPE_STRATEGIES` controla quais
  estratégias valem (vazio = nenhuma).
- Os dados locais (histórico, desempenho de estratégias, malha) vão para
  `engine/data/`, que é ignorado pelo git.

## Como rodar (modo mock, offline)

```bash
cd engine
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
CELESTIA_MOCK=1 python -m celestia_engine search GRU LIS --depart 2030-03-10
```

API HTTP local (mock): `CELESTIA_MOCK=1 python -m celestia_engine serve`.
Scraping local opcional: `pip install -r requirements-scrapers.txt && playwright install chromium`.
Variáveis disponíveis: `.env.example` (copie para `engine/.env`).

## Testes

Na raiz do repositório: `pytest -q` (roda os testes da raiz e `engine/tests`,
sem acesso à rede).

## Aviso legal

Raspar sites de companhias aéreas e o Google Flights viola os Termos de Uso
desses serviços. Habilitar o scraping (chaves, estratégias ou Playwright) é
decisão e responsabilidade do dono do projeto.
