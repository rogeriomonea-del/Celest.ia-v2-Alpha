import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Cpu, FlaskConical, Plane, SearchX, SlidersHorizontal } from 'lucide-react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { FlightCard } from './components/FlightCard'
import { FilterSidebar } from './components/FilterSidebar'
import { StrategyPanel } from './components/StrategyPanel'
import {
  FilterSidebarSkeleton,
  FlightCardSkeleton,
  SortTabsSkeleton,
} from './components/Skeletons'
import { findAirport } from './data/airports'
import { buildFlights } from './data/flights'
import {
  fetchApiMode,
  mapEngineFlights,
  searchFlights,
  type ApiMode,
  type EngineSearchResponse,
} from './api'
import { applyFilters, sortFlights } from './utils/flightLogic'
import { addDays, startOfDay } from './utils/dates'
import { formatShortDate } from './utils/format'
import type { Filters, Flight, SearchParams, SortKey } from './types'

const SEARCH_LATENCY_MS = 1400
const SKELETON_COUNT = 5
/** Slider bounds snap to this step so the true max/min stay reachable. */
const PRICE_STEP = 50

function buildDefaultSearch(): SearchParams {
  const today = startOfDay(new Date())
  return {
    origin: findAirport('GRU'),
    destination: findAirport('LIS'),
    departDate: addDays(today, 21),
    returnDate: addDays(today, 28),
    passengers: { adults: 1, children: 0, infants: 0 },
    tripType: 'roundtrip',
    cabin: 'economy',
    flexibility: { enabled: false, preset: '2w', windowStart: null, windowEnd: null },
  }
}

function buildDefaultFilters(flights: Flight[]): Filters {
  return {
    stops: [0, 1, 2],
    airlines: [...new Set(flights.map((flight) => flight.airline.code))],
    maxPrice:
      flights.length > 0
        ? Math.ceil(Math.max(...flights.map((flight) => flight.price)) / PRICE_STEP) * PRICE_STEP
        : 0,
    departureWindows: [],
  }
}

export default function App() {
  const [params, setParams] = useState<SearchParams>(buildDefaultSearch)
  const [results, setResults] = useState<Flight[]>([])
  const [filters, setFilters] = useState<Filters | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('best')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  /** Relatório do motor quando a busca foi real; null = modo demonstração. */
  const [engine, setEngine] = useState<EngineSearchResponse | null>(null)
  /** Modo detectado no /api/status: real, mock ou API fora do ar. */
  const [apiMode, setApiMode] = useState<ApiMode | null>(null)
  /** Em modo real não buscamos sozinhos (custa créditos e minutos). */
  const [idle, setIdle] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const apiModeRef = useRef<ApiMode>('off')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const searchSeq = useRef(0)

  const runSearch = useCallback((nextParams: SearchParams) => {
    setParams(nextParams)
    setIdle(false)
    setSearchError(null)
    setLoading(true)
    const seq = ++searchSeq.current
    clearTimeout(searchTimer.current)

    const apply = (
      flights: Flight[],
      engineData: EngineSearchResponse | null,
      error: string | null = null,
    ) => {
      if (seq !== searchSeq.current) return // resposta antiga: descarta
      setEngine(engineData)
      setSearchError(error)
      setResults(flights)
      setFilters(buildDefaultFilters(flights))
      setLoading(false)
    }

    // 1º tenta o motor real via API (/api/search). Se a API não estiver de
    // pé (ex.: site estático sem backend), degrada para a demonstração com
    // dados fictícios — sempre sinalizada como tal no banner.
    searchFlights(nextParams)
      .then((response) => apply(mapEngineFlights(response, nextParams.cabin), response))
      .catch((error: unknown) => {
        if (apiModeRef.current === 'real') {
          // A API real está de pé mas a busca falhou/estourou o tempo:
          // NUNCA mascarar com dados fictícios — erro honesto.
          apply([], null, error instanceof Error ? error.message : 'busca falhou')
          return
        }
        searchTimer.current = setTimeout(() => {
          apply(buildFlights(nextParams.origin.code, nextParams.destination.code), null)
        }, SEARCH_LATENCY_MS)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchApiMode().then((mode) => {
      if (cancelled) return
      apiModeRef.current = mode
      setApiMode(mode)
      if (mode === 'real') {
        // Busca real raspa as companhias (minutos + créditos): espera o clique.
        setIdle(true)
        setLoading(false)
      } else {
        runSearch(buildDefaultSearch())
      }
    })
    return () => {
      cancelled = true
      clearTimeout(searchTimer.current)
    }
  }, [runSearch])

  // SEO/UX: o título da aba acompanha a rota, mas só depois de uma busca do
  // usuário — a carga inicial preserva o título estático otimizado para SEO.
  const userSearchedRef = useRef(false)
  const handleUserSearch = useCallback(
    (nextParams: SearchParams) => {
      userSearchedRef.current = true
      runSearch(nextParams)
    },
    [runSearch],
  )
  useEffect(() => {
    if (!userSearchedRef.current) return
    document.title = `Voos ${params.origin.city} (${params.origin.code}) → ${params.destination.city} (${params.destination.code}) | celest.ia`
  }, [params.origin, params.destination])

  const priceBounds = useMemo(() => {
    if (results.length === 0) return { min: 0, max: 0 }
    const prices = results.map((flight) => flight.price)
    return {
      min: Math.floor(Math.min(...prices) / PRICE_STEP) * PRICE_STEP,
      max: Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP,
    }
  }, [results])

  const filteredFlights = useMemo(
    () => (filters ? applyFilters(results, filters) : results),
    [results, filters],
  )

  const sortedFlights = useMemo(
    () => sortFlights(filteredFlights, sortKey),
    [filteredFlights, sortKey],
  )

  const topByKey = useMemo(
    () => ({
      best: sortFlights(filteredFlights, 'best')[0] ?? null,
      cheapest: sortFlights(filteredFlights, 'cheapest')[0] ?? null,
      fastest: sortFlights(filteredFlights, 'fastest')[0] ?? null,
    }),
    [filteredFlights],
  )

  const cheapestId = topByKey.cheapest?.id ?? null
  const fastestId = topByKey.fastest?.id ?? null

  const dateSummary = params.returnDate
    ? `${formatShortDate(params.departDate)} – ${formatShortDate(params.returnDate)}`
    : formatShortDate(params.departDate)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero + search */}
        <section className="relative bg-gradient-to-b from-ink-950 via-ink-900 to-ink-900 pb-20 pt-14 sm:pt-20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-gold-500/10 blur-3xl" />
            <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-pine-500/10 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px hairline-gold opacity-40" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-9 text-center">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-300">
                <span className="h-1 w-1 rounded-full bg-gold-400" aria-hidden="true" />
                Busca inteligente de voos e milhas
              </span>
              <h1 className="font-serif text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">
                Sua próxima viagem,
                <br className="hidden sm:block" />{' '}
                <span className="italic text-gold-300">com inteligência.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-300 sm:text-base">
                Comparamos dinheiro, milhas e upgrade em dezenas de companhias — e
                calculamos a estratégia de compra mais vantajosa para você.
              </p>
            </div>
            <SearchBar initialParams={params} loading={loading} onSearch={handleUserSearch} />
          </div>
        </section>

        {/* Results */}
        <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2.5 font-serif text-2xl font-medium tracking-tight text-ink-900">
                {params.origin.city}
                <ArrowRight className="h-5 w-5 text-gold-500" aria-hidden="true" />
                {params.destination.city}
              </h2>
              <p role="status" aria-live="polite" className="mt-1 text-sm text-ink-500">
                {dateSummary} ·{' '}
                {idle
                  ? 'pronto para buscar'
                  : loading
                    ? 'buscando…'
                    : `${filteredFlights.length} de ${results.length} voos`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileFilters((current) => !current)}
              aria-expanded={showMobileFilters}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-card transition-colors hover:border-gold-300 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtros
            </button>
          </div>

          {!loading && !idle && searchError !== null && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800">
              <SearchX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <strong className="font-semibold">A busca real falhou</strong> — {searchError}.
                Veja o terminal da API para o detalhe e tente novamente.
              </p>
            </div>
          )}

          {!loading && !idle && searchError === null && engine === null && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <strong className="font-semibold">Modo demonstração</strong> — estes voos são
                fictícios. Suba a API do motor (<code className="rounded bg-amber-100 px-1 py-0.5 text-[12px] font-semibold">python -m celestia_engine serve</code>)
                para buscar tarifas de verdade.
              </p>
            </div>
          )}

          {!loading && engine !== null && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-pine-200 bg-pine-50/80 px-4 py-3 text-sm text-pine-800">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" aria-hidden="true" />
              <p>
                <strong className="font-semibold">
                  {engine.mode === 'real'
                    ? 'Busca real do motor celest.ia'
                    : 'Motor celest.ia em modo demo (mock)'}
                </strong>{' '}
                — {engine.flights.length} oferta(s) de {engine.stats.candidatesTotal} candidatos
                em {engine.stats.durationSeconds}s
                {engine.stats.scrapesSavedByPrefilter > 0 &&
                  `, ${engine.stats.scrapesSavedByPrefilter} scrapes economizados pelo pré-filtro`}
                .
                {engine.flights.length > 0 &&
                  engine.flights.every((flight) => flight.indicative) &&
                  ' Preços indicativos do metasearch (Google Flights/Skyscanner) — esta rota não é raspável direto na Copa/LATAM.'}
              </p>
            </div>
          )}

          {!loading && engine !== null && engine.options.length > 0 && (
            <div className="mb-5">
              <StrategyPanel options={engine.options} />
            </div>
          )}

          {idle ? (
            <div className="flex flex-col items-center rounded-2xl border border-ink-200 bg-white px-6 py-16 text-center shadow-card">
              <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 ring-1 ring-inset ring-gold-200">
                <Cpu className="h-7 w-7 text-gold-600" aria-hidden="true" />
              </span>
              <h3 className="font-serif text-xl font-medium text-ink-900">
                Motor conectado — pronto para buscar
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                A busca real raspa as companhias e o metasearch de verdade, o que
                leva alguns minutos e consome créditos — por isso ela só roda
                quando você clicar em <strong className="font-semibold text-ink-700">Buscar voos</strong> ali em cima.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            {/* Sidebar */}
            <div className={`${showMobileFilters ? 'block' : 'hidden'} lg:block`}>
              <div className="lg:sticky lg:top-20">
                {loading || !filters ? (
                  <FilterSidebarSkeleton />
                ) : (
                  <FilterSidebar
                    flights={results}
                    filters={filters}
                    priceBounds={priceBounds}
                    onChange={setFilters}
                  />
                )}
              </div>
            </div>

            {/* Flight list */}
            <div className="space-y-4">
              {loading ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
                    <Plane className="h-4 w-4 animate-pulse text-gold-600" aria-hidden="true" />
                    {apiMode === 'real'
                      ? 'Busca real em andamento — o motor está raspando as companhias. Pode levar alguns minutos; acompanhe o progresso no terminal da API.'
                      : 'Buscando as melhores tarifas em mais de 30 parceiros…'}
                  </div>
                  <SortTabsSkeleton />
                  {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                    <FlightCardSkeleton key={index} />
                  ))}
                </>
              ) : (
                <>
                  <SortTabs topByKey={topByKey} active={sortKey} onChange={setSortKey} />
                  {sortedFlights.length === 0 ? (
                    <div className="flex flex-col items-center rounded-2xl border border-ink-200 bg-white px-6 py-16 text-center shadow-card">
                      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-ink-100">
                        <SearchX className="h-7 w-7 text-ink-400" aria-hidden="true" />
                      </span>
                      {engine !== null && results.length === 0 ? (
                        <>
                          <h3 className="font-serif text-xl font-medium text-ink-900">
                            Nenhuma fonte respondeu com preço desta vez
                          </h3>
                          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                            Você não sai de mãos vazias: abra a busca já montada no
                            Google Flights, ou tente com origem internacional (GRU),
                            flexibilidade de datas, e veja o terminal da API.
                          </p>
                          {engine.lastResort && (
                            <a
                              href={engine.lastResort.bookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-6 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-ink-800"
                            >
                              Abrir busca pronta no Google Flights
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          <h3 className="font-serif text-xl font-medium text-ink-900">
                            Nenhum voo corresponde aos filtros
                          </h3>
                          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
                            Tente ampliar o preço máximo ou incluir mais companhias e horários.
                          </p>
                          {filters && (
                            <button
                              type="button"
                              onClick={() => setFilters(buildDefaultFilters(results))}
                              className="mt-6 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-ink-800"
                            >
                              Limpar filtros
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    sortedFlights.map((flight) => (
                      <FlightCard
                        key={flight.id}
                        flight={flight}
                        isCheapest={flight.id === cheapestId}
                        isFastest={flight.id === fastestId}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  )
}
