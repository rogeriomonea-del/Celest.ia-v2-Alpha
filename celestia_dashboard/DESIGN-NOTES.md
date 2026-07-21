# celest.ia — Sistema de Design (premium / concierge)

Notas para revisão de layout. Stack: **React 18 + TypeScript + Tailwind CSS + Vite**,
ícones `lucide-react`. Sem UI kit externo — componentes próprios em `src/components/`.

## Direção visual
Grafite quente + dourado sóbrio + esmeralda profunda. Sensação de concierge de
viagens (confiança, exclusividade), muito respiro, serifa de exibição nos títulos
e preços.

## Tokens de cor — `tailwind.config.js`
Para virar a identidade inteira sem reescrever cada `className`, os nomes de cor do
Tailwind foram **remapeados** para a paleta premium:

| Nome Tailwind        | Vira      | Uso |
|----------------------|-----------|-----|
| `slate`/`gray`/`neutral` | **ink**  | grafite quente: fundo, texto, bordas |
| `indigo`/`violet`    | **gold**  | dourado: destaques, milhas, "melhor opção" |
| `emerald`/`green`    | **pine**  | esmeralda: voo direto, sucesso, sustentável |

Também existem os nomes diretos `ink-*`, `gold-*`, `pine-*`. Os **CTAs** são em
grafite (`bg-ink-900`) aplicados explicitamente. `amber` e `red` seguem os padrões
do Tailwind (avisos e erros).

Escalas em `tailwind.config.js` (50→950). `boxShadow`: `card`, `lift`, `gold`
(elevação quente, não o cinza-azulado padrão).

## Tipografia
- **Fraunces Variable** (serifa de exibição, self-hosted via `@fontsource-variable/fraunces`)
  → `font-serif`. Usada em headline do hero, títulos de seção e **preços/totais**.
- **Inter Variable** (corpo) → `font-sans` (padrão).
- Importadas em `src/main.tsx`. Números com `.tnum` (tabular) para alinhar colunas.
- `src/index.css` calibra `font-optical-sizing` e `letter-spacing` da serifa, e traz
  o utilitário `.hairline-gold` (fio dourado no topo de superfícies premium).

## Onde mora cada peça
- **Hero + estados + banners**: `src/App.tsx` (gradiente grafite, headline serifada
  dourada, selo, escada de resultados, banners real/demo/erro, cards idle e vazio).
- **Header**: `src/components/Header.tsx` (wordmark serifado `celest` + `.ia` dourado).
- **Busca**: `SearchBar.tsx` (fio dourado, pílulas grafite, CTA flutuante grafite) +
  `AirportInput.tsx`, `DateRangePicker.tsx`/`MonthGrid.tsx`, `PassengerSelector.tsx`,
  `FlexibilityToggle.tsx`.
- **Resultados**: `FlightCard.tsx` (preço serifado, milhas douradas, "Ver oferta"
  grafite, badges), `SortTabs.tsx`, `FilterSidebar.tsx`, `StrategyPanel.tsx`
  (destaque dourado na melhor opção), `Badge.tsx` (tons gold/pine/amber/red/ink),
  `AirlineLogo.tsx` (mantém as cores de marca das companhias).
- **Rodapé**: `Footer.tsx`.

## Contrato com o motor (NÃO alterar no redesign)
O front consome a API do motor Python via `src/api.ts` (tipos `EngineSearchResponse`,
`EngineFlight`, `EngineOption`) e mapeia para os tipos de UI em `src/types.ts`. O
redesign é **só de aparência** — nenhuma mudança de dados, props ou lógica.

## Como rodar
```bash
npm install
npm run dev      # http://localhost:5173  (modo demo sem a API)
npm run build    # dist/  (typecheck estrito + bundle)
```
Sem a API do motor no ar, o app roda em **modo demonstração** com dados fictícios
(sinalizado em banner). Com a API em `:8000`, entra em modo real.

## Pontos que valem uma segunda opinião do revisor
- Peso/《presença》do dourado (hoje sóbrio: bordas, milhas, "melhor opção").
- Densidade dos `FlightCard` (respiro vs. compacto).
- Headline do hero ("Sua próxima viagem, com inteligência.").
- Escala tipográfica e uso da serifa em preços.
- Acessibilidade de contraste (ink-500 em branco, gold-600/700 em branco).
- Responsivo mobile (grid do `SearchBar` e da lista).
