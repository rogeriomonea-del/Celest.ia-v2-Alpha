# celest.ia — agent notes

Research planner prototype (`research_planner.py`) with flight-price scrapers
(`scrapers.py`: Copa Airlines, Skyscanner, ConnectMiles) and a dashboard under
`celestia_dashboard/`. Tests run with `pytest`.

## Web data: use Firecrawl

Firecrawl is the web-data layer for this repo. Routing:

- **Need web data during a session** (search, scrape a URL, drive a page) →
  Firecrawl CLI / `firecrawl` skills (`firecrawl-search`, `firecrawl-scrape`,
  `firecrawl-interact`).
- **Wiring web data into this codebase** (replacing the `urllib` + regex
  scrapers) → `firecrawl-build` skills; endpoint mapping lives in
  [FIRECRAWL.md](FIRECRAWL.md).
- **Recurring checks** ("track this fare", "alert when it changes") →
  `/monitor` via `firecrawl monitor create`, not repeated one-off scrapes.
- **Finished deliverables** (research brief, competitive fare digest) →
  `firecrawl-workflows` skills.

Setup, credentials, verification, and the remote-session proxy fix are in
[FIRECRAWL.md](FIRECRAWL.md). If skills/CLI are missing in a fresh session:
`npx -y firecrawl-cli@latest init --all -y -k "$FIRECRAWL_API_KEY"`.

`FIRECRAWL_API_KEY` comes from `.env` (copy `.env.example`); never commit a
real key.
