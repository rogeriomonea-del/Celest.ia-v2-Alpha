# AGENTS.md — protocolo de colaboração (Claude Code + GPT/Codex)

Este arquivo é o **contrato operacional** para os dois assistentes que trabalham
neste repositório. O Codex/GPT lê `AGENTS.md` automaticamente; o Claude Code
também o segue. Humano no comando: **Ro** (decide prioridade e merge).

## 1. Fonte única de verdade

- O repositório `rogeriomonea-del/Celest.ia-v2-Alpha` **é** a fonte de verdade.
  **Nada de ZIPs paralelos** ou cópias locais divergentes (salvo pedido expresso).
- Antes de qualquer trabalho: `git fetch` e **parta do SHA mais recente** da branch
  base correta (ver §2). Nunca sobrescreva trabalho do outro por ter partido de um
  estado antigo.

## 2. Branches e base

- **Branch por autor:** Claude usa `claude/*`; GPT/Codex usa `gpt/*` ou `codex/*`.
  Cada um mexe no seu — ninguém empurra na branch do outro sem combinar.
- **Base atual:** enquanto o PR #8 (`claude/flight-search-platform-4oy9gs`, head
  `218e8fd`) não for mesclado, ele é a **base técnica vigente** — a `main` (`398a7f1`)
  está atrasada. Trabalho novo parte do head do PR #8, **não** da `main`.
- Depois que a `main` incorporar o PR #8, volte a partir da `main`.

## 3. Revezamento (1 turno por vez)

1. Faça o trabalho na sua branch, com commits pequenos e descritivos.
2. `push` e abra/atualize o PR.
3. Deixe **um comentário de handoff** no PR: o que foi feito, o que validar, de quem
   é a vez. Esse comentário substitui o antigo "envio de pasta".
4. A revisão é ler o **diff no GitHub** (não ZIP); comente linha a linha ou empurre
   um commit de correção.
5. Só o **Ro** mescla. Nenhum assistente faz merge sem ordem explícita dele.

O Claude Code assina os eventos do PR e **acorda sozinho** em comentários/commits.
Para iniciar o turno do GPT/Codex, o Ro dá um empurrão de uma linha ("olha o PR #N").

## 4. Invariantes inegociáveis (não quebrar sem ordem do Ro)

- **Contrato de API congelado:** `POST /api/search` e `POST /api/search/multi-city`
  mantêm request/response byte-compatíveis. Há testes que congelam o shape.
- **Testes verdes:** rode `python -m pytest` (hoje **140 verdes**) e, no site,
  `npm run build`. **Nenhum teste apagado ou enfraquecido** para passar; comportamento
  novo vem com teste novo.
- **Matemática financeira 100% determinística:** `pricing/calculator.py`,
  `agents/miles.py`, `storage/strategy_stats.py` e `agents/multicity.combine_itineraries`
  **jamais** passam por LLM.
- **Fronteira Claude × Firecrawl** (rodada de roteamento de modelos): o **Firecrawl
  navega** (dirige o browser vivo); o **Claude extrai** conteúdo já renderizado.
  Claude não substitui a navegação.
- **Degradação graciosa:** sem `ANTHROPIC_API_KEY`/`FIRECRAWL_API_KEY` o motor
  continua funcionando (fallbacks/`CELESTIA_MOCK=1`). Nada quebra por falta de chave.
- **Segurança:** nunca commitar/logar chaves; `.env` fora do repo; sem segredos em
  código, PR ou logs. Não inventar tarifa/milhas/capacidade que a fonte não tem.

## 5. Roteamento de modelos Claude (quando a API for conectada)

A escolha de modelo é **config**, não inferência: `config.py` expõe `has_claude()` e
`model_for(task)` resolvendo `CLAUDE_MODEL_<TASK>` (env) → default por tier. Tiers:
**Fable 5** (`claude-fable-5`) raciocínio difícil e raro · **Opus** (`claude-opus-4-8`)
pesado, só fallback · **Sonnet** (`claude-sonnet-5`) extração estruturada padrão ·
**Haiku** (`claude-haiku-4-5-20251001`) simples/alto volume · **nenhum** = permanece
determinístico. Tabela detalhada em `docs/model-routing.md` (a criar nessa rodada).

## 6. Checklist de fim de turno

- [ ] `python -m pytest` verde  ·  [ ] `npm run build` limpo (se mexeu no site)
- [ ] `git diff --check` limpo (sem espaço/conflito)
- [ ] contrato de API intacto (ou mudança combinada com o Ro)
- [ ] nenhum segredo adicionado  ·  [ ] `.env` não commitado
- [ ] push feito + comentário de handoff no PR
