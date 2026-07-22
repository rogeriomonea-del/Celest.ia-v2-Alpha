# celest.ia — Nebula Cartography

Sistema visual do frontend final. A direção combina a sobriedade de um
concierge de viagens com uma cartografia orbital discreta: espacial, editorial
e confiável — sem aparência de um comparador convencional.

## Linguagem

- **Hero:** espaço profundo, grade cartográfica, rota orbital e telemetria CSS.
- **Busca:** “console de trajetória” marfim, em duas linhas, sobreposto ao hero.
- **Resultados:** continuidade do espaço profundo, com grade cartográfica sutil,
  painéis de vidro navy e hierarquia financeira em marfim, aqua e dourado.
- **Estratégias:** a melhor decisão recebe um painel orbital destacado; as
  alternativas continuam no mesmo console escuro, sem ocultar opções ou notas.
- **Movimento:** somente feedback curto, brilho e deslocamento sutil; toda
  animação respeita `prefers-reduced-motion`.

## Paleta

| Família | Papel |
| --- | --- |
| `space-*` | azul-noite do hero, header e superfícies de inteligência |
| `ink-*` | compatibilidade de tokens e superfícies auxiliares internas |
| `aqua-*` | rota, status, foco e sinais do motor |
| `gold-*` | milhas, recomendação e calor premium |
| `pine-*` | sucesso, voo direto e estados positivos |

Texto de interface usa `space-100/200` sobre superfícies `space-900/950`.
Dourado luminoso `gold-200/300` identifica milhas e decisões; aqua marca rota,
estado e foco. Painéis nunca retornam ao branco editorial após o hero.

## Tipografia

- **Fraunces Variable:** headlines, títulos editoriais e valores financeiros.
- **Inter Variable:** interface, corpo, rótulos e controles.
- Ambas são self-hosted por `@fontsource`; não existe importação de CDN.
- `.tnum` ativa numerais tabulares em horários, preços e milhas.

## Acessibilidade e responsividade

- foco visível global, skip link e landmarks semânticos;
- busca como formulário, status com `aria-live` e falhas reais com `role=alert`;
- autocomplete com combobox/listbox e controles com nomes acessíveis;
- popovers viram bottom sheets no mobile; filtros usam drawer com Escape;
- CTAs têm alvo mínimo de 44 px e ficam full-width nos cards mobile;
- tarifas indicativas e horários estimados nunca dependem apenas de cor.

## Fronteira do motor

`src/api.ts` conserva integralmente as interfaces `Engine*`, envia o JSON do
motor e mapeia a resposta. A UI consome exclusivamente os tipos de apresentação
de `src/types.ts`. O redesign não altera nenhum endpoint ou campo HTTP.
