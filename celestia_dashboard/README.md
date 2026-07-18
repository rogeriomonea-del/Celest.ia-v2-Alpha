# celest.ia · Busca de Voos

Plataforma de busca de voos de nível de produção (estilo Kayak / Skyscanner /
Google Flights), construída com **React + TypeScript**, **Tailwind CSS** e
**Lucide React**.

## Destaques

- **Hero de busca** com gradiente, typeahead de aeroportos (códigos IATA),
  `DateRangePicker` customizado com dois meses e seleção de intervalo, e
  popover de passageiros (adultos / crianças / bebês + classe de cabine).
- **Listagem profissional**: abas de ordenação "Melhor · Mais barato · Mais
  rápido" com resumo de preço/duração, cartões de voo em grid de 3 colunas
  (companhia + horários · duração + linha de escalas · preço + CTA), badges de
  urgência ("Voo direto", "Poucos lugares") e detalhes expansíveis.
- **Sidebar de filtros funcional**: escalas, preço máximo, horário de partida
  e companhias — com contagens e menor preço por opção.
- **Estados realistas**: skeleton loaders pulsantes durante a busca, estado
  vazio com reset de filtros e dados mock em BRL.

## Como rodar

```bash
npm install
npm run dev        # servidor de desenvolvimento (Vite)
npm run build      # typecheck + build de produção
npm run preview    # serve o build de produção
```

## Estrutura

```text
src/
├── App.tsx                    # composição da página + estado de busca/filtros
├── components/
│   ├── SearchBar.tsx          # hero search (origem/destino/datas/passageiros)
│   ├── AirportInput.tsx       # typeahead com códigos IATA e navegação por teclado
│   ├── DateRangePicker.tsx    # calendário duplo com seleção de intervalo
│   ├── PassengerSelector.tsx  # popover com steppers e classe de cabine
│   ├── SortTabs.tsx           # Melhor / Mais barato / Mais rápido
│   ├── FlightCard.tsx         # cartão de voo com badges e detalhes expansíveis
│   ├── FilterSidebar.tsx      # filtros de escalas, preço, horário e companhias
│   ├── Skeletons.tsx          # loaders de percepção de velocidade
│   ├── AirlineLogo.tsx        # logo placeholder com gradiente por companhia
│   ├── Badge.tsx              # etiquetas (verde/vermelho/índigo/âmbar)
│   ├── Header.tsx / Footer.tsx
├── data/
│   ├── airports.ts            # base de aeroportos (IATA)
│   └── flights.ts             # inventário mock realista (preços em BRL)
├── hooks/useClickOutside.ts
└── utils/                     # formatação BRL/datas, filtros e ordenação
```
