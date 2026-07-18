# Firecrawl setup & routing — celest.ia

Firecrawl is set up as the web-data layer for this project: search, clean
scraping, browser interaction (logins, forms), document parsing, research
index, and page-change monitoring.

## Install (one command, three skill segments)

```bash
npx -y firecrawl-cli@latest init --all --browser
```

Running headless / in an agent session with a key already available:

```bash
npx -y firecrawl-cli@latest init --all -y -k "$FIRECRAWL_API_KEY"
```

This installs the `firecrawl` CLI globally, authenticates, and installs three
skill segments for AI coding agents:

| Segment         | Question it answers                                   | Use in this repo                            |
| --------------- | ----------------------------------------------------- | ------------------------------------------- |
| CLI skills      | "Which Firecrawl command should I run right now?"     | Ad-hoc research, debugging a scraper target |
| Build skills    | "How do I add a Firecrawl API call to this codebase?" | Replacing/backing `scrapers.py` (see below) |
| Workflow skills | "What finished deliverable should I produce?"         | Fare intel digests, research briefs         |

## Credentials

```bash
# .env (gitignored — never commit a real key)
FIRECRAWL_API_KEY=fc-your-key-here
```

Copy `.env.example` to `.env` and fill in your key. Get a key at
<https://www.firecrawl.dev/signin?view=signup> (dashboard → API keys), or let
the CLI's browser auth store one for you.

## Verify

```bash
mkdir -p .firecrawl
firecrawl --status                                          # expect: Authenticated
firecrawl scrape "https://firecrawl.dev" -o .firecrawl/install-check.md
```

`.firecrawl/` is a local cache and is gitignored.

## Routing for this repo

This project's primary fit is **app integration (Path B)**: `scrapers.py`
currently drives Copa Airlines, Skyscanner, and ConnectMiles with raw
`urllib` + regex, which breaks on JavaScript-rendered pages and can't handle
logins. Map each function to a Firecrawl endpoint:

| Current code                             | Problem                                  | Firecrawl endpoint                                                        |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `scrape_copa_airlines()`                 | JS-rendered results page, brittle regex  | `/scrape` (rendered markdown/JSON) after `/search` or a known results URL |
| `scrape_skyscanner()`                    | Same, plus heavy bot protection          | `/scrape`; escalate to `/interact` when the page needs the search form    |
| `scrape_connect_miles()`                 | CSRF login flow, session state           | `/interact` (browser actions: fill login, navigate, extract balance)      |
| Recurring fare checks (research planner) | Re-scraping the same URLs on a schedule  | `/monitor` — diffs checks, AI judge filters noise, webhook/email/Slack    |
| Literature / prior-art lookups           | Manual searching                         | `/search` + research index (`/search/research/papers`, `search-github`)   |

Python SDK for the integration:

```bash
pip install firecrawl-py
```

```python
import os
from firecrawl import Firecrawl

fc = Firecrawl(api_key=os.environ["FIRECRAWL_API_KEY"])
doc = fc.scrape("https://www.copaair.com/...", formats=["markdown"])
```

When implementing, hand off to the `firecrawl-build` skill (endpoint routing,
SDK call sites, smoke test). For one-off data pulls during a session, use the
CLI directly (`firecrawl search`, `firecrawl scrape`, `firecrawl interact`).
For finished deliverables (e.g. a fare-comparison brief), start from the
`firecrawl-workflows` skill.

## Claude Code on the web — proxy note

Remote sessions route HTTPS through an agent proxy. If `firecrawl` commands
fail with `405 Method Not Allowed`, the bundled axios (< 1.16.1) is sending
non-CONNECT proxy requests. Fix without touching TLS settings:

```bash
cd "$(npm root -g)/firecrawl-cli" && npm install axios@latest --no-save
cd "$(npm root -g)/firecrawl-cli/node_modules/firecrawl" && npm install axios@latest --no-save
```

## Rerun inputs

- Install: `npx -y firecrawl-cli@latest init --all -y -k "$FIRECRAWL_API_KEY"`
- Verify: `firecrawl --status` + scrape check above
- Key: `FIRECRAWL_API_KEY` in `.env` (local) or session env
- Docs: <https://docs.firecrawl.dev> · Skills: <https://github.com/firecrawl/skills>
