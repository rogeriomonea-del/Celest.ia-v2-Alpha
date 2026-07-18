# celest.ia Travel — Pesquisa Multi-Agente de Passagens e Milhas

Plataforma em Python que busca passagens aéreas em múltiplos provedores,
avalia cada oferta com um pipeline de agentes especializados e decide, ativo
por ativo, se compensa emitir com **dinheiro ou milhas** — com narrativa
analítica opcional gerada pela API da Anthropic (Claude).

Roda 100% offline por padrão (provedor de demonstração determinístico); os
provedores reais e a narrativa via LLM são ativados por variáveis de ambiente,
sempre com degradação segura (nunca inventa dados).

## Arquitetura de agentes

O `Orchestrator` conduz um pipeline sequencial-paralelo:

1. **Planejador** (`agents/planner.py`) — decompõe a missão em tarefas de busca (uma por data × provedor), expandindo a janela de datas flexível e destacando terças/quartas, historicamente mais baratas.
2. **Buscador** (`agents/search.py`) — executa todas as tarefas **em paralelo** (`asyncio.gather`) contra os provedores; falhas e provedores sem credencial viram avisos, não erros.
3. **Auditor** (`agents/auditor.py`) — remove inválidas, consolida duplicatas pela mais barata, descarta outliers de preço e sinaliza tarifas suspeitas (possível erro de tarifa).
4. **Avaliador** (`agents/valuation.py`) — pontua cada oferta (preço, paradas, duração) e calcula o **milheiro implícito** de cada emissão, recomendando dinheiro ou milhas frente à sua referência; cruza com o saldo real para alertar saldo insuficiente.
5. **Relator** (`agents/reporter.py` + `agents/advisor.py`) — consolida o Top 5 e escreve o parecer. Se houver credencial da Anthropic, o parecer vem do **Claude**; caso contrário, uma narrativa heurística determinística assume.

Provedores em `providers/` (contrato comum `FlightProvider`): `MockProvider`
(demo offline), `SkyscannerProvider` (API de parceiros) e `CopaProvider`
(endpoint NDC/parceiro). Saldo de milhas em `miles/connectmiles.py`, com sessão
autenticada real (cookie jar + token CSRF) e modo mock para desenvolvimento.

```text
celestia_travel/
├── orchestrator.py       # pipeline state-driven
├── models.py             # tipos de domínio (FlightQuery, FlightOffer, ...)
├── config.py             # Settings.from_env()
├── cli.py                # `buscar` e `saldo`
├── agents/               # planner, search, auditor, valuation, reporter, advisor
├── providers/            # mock, skyscanner, copa (+ base)
└── miles/                # connectmiles
```

## Uso

```bash
# Busca offline (provedor demo), janela flexível de ±2 dias, 2 passageiros
python -m celestia_travel.cli buscar GRU MIA 2026-08-11 --flex 2 --passageiros 2

# Salva o relatório completo em JSON
python -m celestia_travel.cli buscar GRU LIS 2026-09-01 --json relatorio.json

# Inclui provedores reais configurados por env (ignora os sem credencial)
python -m celestia_travel.cli buscar GRU MIA 2026-08-11 --live

# Saldo de milhas (mock sem credenciais)
python -m celestia_travel.cli saldo
```

Após instalar (`pip install -e .`), o comando `celestia-travel` fica disponível.

### Configuração (variáveis de ambiente)

| Variável | Efeito |
|---|---|
| `CELESTIA_MILHEIRO` | Sua referência de valor do milheiro em R$/1.000 (padrão 20) |
| `SKYSCANNER_API_KEY` | Ativa o provedor Skyscanner (`--live`) |
| `COPA_API_URL` | Endpoint de parceiro/NDC da Copa (`--live`) |
| `CONNECTMILES_USER` / `CONNECTMILES_PASSWORD` | Saldo real do ConnectMiles |
| `ANTHROPIC_API_KEY` (ou `ANTHROPIC_AUTH_TOKEN`) | Narrativa do relatório via Claude |
| `CELESTIA_LLM_MODEL` | Modelo Claude a usar (padrão `claude-opus-4-8`) |
| `CELESTIA_USE_LLM=1` | Força a narrativa via LLM usando perfil `ant auth login` |

A narrativa via Claude usa a API de Mensagens da Anthropic
(`anthropic.Anthropic().messages.create`); instale o extra opcional com
`pip install -e ".[llm]"`. Sem SDK, sem credencial ou em qualquer erro de API,
a plataforma cai automaticamente na narrativa heurística.

## Testes

```bash
pip install pytest
pytest
```

A suíte cobre validação de domínio, determinismo do provedor demo, deduplicação
e detecção de outliers do auditor, a lógica dinheiro-vs-milhas do avaliador, o
pipeline completo do orquestrador e o cliente ConnectMiles (com transporte
injetável, sem rede).

> **Aviso:** projeto educacional. Automação de login em áreas autenticadas e
> scraping podem violar os termos de uso dos serviços — use apenas com suas
> próprias contas e por sua responsabilidade.
