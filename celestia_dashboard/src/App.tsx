import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Plane, SearchX, SlidersHorizontal, TrendingDown } from 'lucide-react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { FlightCard } from './components/FlightCard'
import { FilterSidebar } from './components/FilterSidebar'
import {
  FilterSidebarSkeleton,
  FlightCardSkeleton,
  SortTabsSkeleton,
} from './components/Skeletons'
import { findAirport } from './data/airports'
import { buildFlights } from './data/flights'
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
  }
}

function buildDefaultFilters(flights: Flight[]): Filters {
  return {
    stops: [0, 1, 2],
    airlines: [...new Set(flights.map((flight) => flight.airline.code))],
    maxPrice: Math.ceil(Math.max(...flights.map((flight) => flight.price)) / PRICE_STEP) * PRICE_STEP,
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
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const runSearch = useCallback((nextParams: SearchParams) => {
    setParams(nextParams)
    setLoading(true)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      const flights = buildFlights(nextParams.origin.code, nextParams.destination.code)
      setResults(flights)
      setFilters(buildDefaultFilters(flights))
      setLoading(false)
    }, SEARCH_LATENCY_MS)
  }, [])

  useEffect(() => {
    runSearch(buildDefaultSearch())
    return () => clearTimeout(searchTimer.current)
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
        <section className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 pb-16 pt-12 sm:pt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Para onde você quer voar?
              </h1>
              <p className="mt-2 text-sm text-indigo-100 sm:text-base">
                Compare tarifas de dezenas de companhias e reserve com confiança.
              </p>
            </div>
            <SearchBar initialParams={params} loading={loading} onSearch={handleUserSearch} />
          </div>
        </section>

        {/* Results */}
        <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                {params.origin.city}
                <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {params.destination.city}
              </h2>
              <p role="status" aria-live="polite" className="text-sm text-slate-500">
                {dateSummary} ·{' '}
                {loading
                  ? 'buscando…'
                  : `${filteredFlights.length} de ${results.length} voos`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileFilters((current) => !current)}
              aria-expanded={showMobileFilters}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtros
            </button>
          </div>

          {!loading && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <TrendingDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <strong className="font-semibold">Os preços estão baixos.</strong> Tarifas nesta
                rota estão 12% abaixo da média dos últimos 3 meses.
              </p>
            </div>
          )}

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
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Plane className="h-4 w-4 animate-pulse text-indigo-600" aria-hidden="true" />
                    Buscando as melhores tarifas em mais de 30 parceiros…
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
                    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                        <SearchX className="h-7 w-7 text-slate-400" aria-hidden="true" />
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        Nenhum voo corresponde aos filtros
                      </h3>
                      <p className="mt-1 max-w-sm text-sm text-slate-500">
                        Tente ampliar o preço máximo ou incluir mais companhias e horários.
                      </p>
                      {filters && (
                        <button
                          type="button"
                          onClick={() => setFilters(buildDefaultFilters(results))}
                          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
                        >
                          Limpar filtros
                        </button>
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
        </section>
      </main>

      <Footer />
    </div>
  )
}
