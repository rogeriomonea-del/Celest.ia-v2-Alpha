# celest.ia · Travel Intelligence

Frontend de produção da plataforma celest.ia, construído com React 18,
TypeScript estrito, Tailwind CSS e Vite. A experiência visual segue a direção
**Nebula Cartography**: cartografia orbital, tipografia editorial e superfícies
de concierge premium.

## Comportamento da API

- `GET /api/status` define o modo `real`, `mock` ou `off` no carregamento.
- Em modo real, nenhuma busca é iniciada automaticamente.
- `POST /api/search` só é disparado após a confirmação do usuário no modo real.
- Em modo `off`, o frontend usa demonstração local sem aguardar o timeout longo
  da busca e sem misturar fixtures a falhas do motor real.
- `src/api.ts` é a única camada que conhece os tipos `Engine*`; componentes usam
  somente os modelos de apresentação de `src/types.ts`.
- `VITE_API_URL` define a base do motor. Vazio usa a mesma origem; em
  desenvolvimento, o Vite encaminha `/api/*` para `127.0.0.1:8000`.

## Como rodar

```bash
npm ci
npm run dev
npm run build
npm run preview
```

`npm run build` executa o TypeScript estrito antes de gerar `dist/`.

## Recursos principais

- autocomplete IATA com navegação por teclado;
- calendário ida/volta e janela flexível por presets ou período personalizado;
- passageiros, cabine e busca responsiva;
- ordenação por melhor, menor preço e menor duração;
- filtros de escalas, preço, horário e companhia, com drawer móvel;
- estratégias de dinheiro, milhas e upgrade com custo efetivo e notas;
- tarifas indicativas e horários estimados rotulados explicitamente;
- estados idle, loading, demo, erro real, vazio, filtros vazios e último recurso;
- fontes Fraunces e Inter self-hosted via `@fontsource`, sem CDN em runtime.

## Estrutura

```text
src/
├── api.ts                 # contrato Engine* + POST/sonda + mapeadores de UI
├── types.ts               # modelos usados pelos componentes
├── App.tsx                # fluxo de estado e composição da experiência
├── components/            # busca, cartografia, cards, filtros e estratégias
├── data/                  # aeroportos e demonstração local
├── hooks/                 # comportamento compartilhado de popovers
└── utils/                 # datas, formatação, filtros e ordenação
```
