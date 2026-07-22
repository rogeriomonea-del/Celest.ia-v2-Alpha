# CHANGES — Nebula Cartography

## Sistema visual integral — resultados

- Estendeu a linguagem Nebula do hero até resultados e rodapé, eliminando a
  ruptura para cards claros convencionais.
- Redesenhou cards de voo, filtros, ordenação, estratégias, banners e todos os
  estados como consoles dark-glass com cartografia, hairlines aqua e valores
  em marfim/dourado.
- Harmonizou popovers da busca, drawer móvel, skeletons, badges e marcadores
  IATA, preservando estrutura, handlers e acessibilidade.
- Não alterou `src/api.ts`, `celestia_engine/` ou `tests/`.

Arquivos desta iteração: `src/App.tsx`, `src/index.css`,
`src/components/{AirlineLogo,Badge,FilterSidebar,FlightCard,Footer,Skeletons,SortTabs,StrategyPanel}.tsx`,
`celestia_dashboard/DESIGN-NOTES.md` e `CHANGES.md`.

## O que mudou nesta iteração

- Hero reconstruído a partir da referência canônica: globo SVG volumétrico,
  atmosfera, terminator, meridianos, paralelos, cidades iluminadas e rota
  ciano→dourado com waypoints, fluxo, avião e pulsos.
- Origem e destino agora usam latitude/longitude reais do dataset local; os
  rótulos permanecem visíveis no desktop e recebem composição própria no mobile.
- Régua de coordenadas e card **Inteligência ao vivo** implementados. O card só
  mostra estratégias, cenários, cotações, flexibilidade e confiança realmente
  disponíveis; sem relatório, usa placeholders neutros.
- CTA duplo e console cockpit implementados sem duplicar lógica: **Traçar
  jornada** submete o mesmo formulário de busca e **Ver como funciona** aponta
  para a seção de estratégias.
- Popovers de aeroporto, datas e viajantes deixaram de ser cortados pelo hero;
  no mobile, a busca aparece antes do globo e os controles continuam empilhados.
- Contraste, foco por teclado, fechamento do autocomplete ao sair do campo e
  `prefers-reduced-motion` refinados. Fraunces e Inter continuam self-hosted.

## Arquivos tocados

- `CHANGES.md`, `SCREENSHOT-1440-final.png`
- `celestia_dashboard/src/{App.tsx,index.css,types.ts}`
- `celestia_dashboard/src/data/airports.ts`
- `celestia_dashboard/src/components/{AirportInput,CoordinateRuler,DateRangePicker,Header,LiveIntelligence,NebulaGlobe,PassengerSelector,SearchBar,StrategyPanel}.tsx`

`src/api.ts`, `celestia_engine/` e `tests/` não foram alterados. Nenhuma nova
requisição de rede em runtime foi adicionada fora de `/api/*`.
