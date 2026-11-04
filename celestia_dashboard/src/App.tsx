import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Bookmark, BookmarkCheck, Plane, PlaneTakeoff, SearchX, SlidersHorizontal } from 'lucide-react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { FlightCard } from './components/FlightCard'
import { FilterSidebar } from './components/FilterSidebar'
import { OfferDialog } from './components/OfferDialog'
import {
  FilterSidebarSkeleton,
  FlightCardSkeleton,
  SortTabsSkeleton,
} from './components/Skeletons'
import { findAirport } from './data/airports'
import { ApiError, searchFlights, UNREACHABLE_MESSAGE } from './lib/api'
import { useSavedSearches } from './features/savedSearches/useSavedSearches'
import type { SavedSearch } from './features/savedSearches/types'
import { applyFilters, sortFlights } from './utils/flightLogic'
import { addDays, startOfDay } from './utils/dates'
import { formatShortDate } from './utils/format'
import type { Filters, Flight, SearchParams, SortKey } from './types'

const SKELETON_COUNT = 5
/** Slider bounds snap to this step so the true max/min stay reachable. */
const PRICE_STEP = 50

type Status = 'idle' | 'loading' | 'error' | 'results'

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
  const prices = flights.map((flight) => flight.price)
  return {
    stops: [0, 1, 2],
    airlines: [...new Set(flights.map((flight) => flight.airline.code))],
    maxPrice: prices.length > 0 ? Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP : 0,
    departureWindows: [],
  }
}

export default function App() {
  const [params, setParams] = useState<SearchParams>(buildDefaultSearch)
  // Bumped when params change from outside the form, so SearchBar re-reads them.
  const [formKey, setFormKey] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const [results, setResults] = useState<Flight[]>([])
  const [filters, setFilters] = useState<Filters | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('best')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [searchedParams, setSearchedParams] = useState<SearchParams | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [offer, setOffer] = useState<Flight | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const { save } = useSavedSearches()
  const loading = status === 'loading'

  const runSearch = useCallback((nextParams: SearchParams) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setParams(nextParams)
    setSearchedParams(nextParams)
    setSavedId(null)
    setHint(null)
    setStatus('loading')
    searchFlights(nextParams, controller.signal).then(
      ({ offers }) => {
        if (controller.signal.aborted) return
        setResults(offers)
        setFilters(buildDefaultFilters(offers))
        setStatus('results')
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setErrorMessage(err instanceof ApiError ? err.message : UNREACHABLE_MESSAGE)
        setStatus('error')
      },
    )
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const handleSelectSaved = useCallback(
    (saved: SavedSearch) => {
      const today = startOfDay(new Date())
      const departDate = saved.params.departDate
      if (departDate && departDate < today) {
        setParams({ ...saved.params, departDate: null, returnDate: null })
        setFormKey((key) => key + 1)
        setHint('As datas desta busca já passaram. Escolha novas datas e busque novamente.')
        return
      }
      setFormKey((key) => key + 1)
      runSearch(saved.params)
    },
    [runSearch],
  )

  const handleSave = async () => {
    if (!searchedParams) return
    const saved = await save(searchedParams)
    if (saved) setSavedId(saved.id)
  }

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

  const shown = searchedParams ?? params
  const dateSummary = shown.returnDate
    ? `${formatShortDate(shown.departDate)} – ${formatShortDate(shown.returnDate)}`
    : formatShortDate(shown.departDate)
  const passengerCount = shown.passengers.adults + shown.passengers.children + shown.passengers.infants
  const showSidebar = status === 'loading' || (status === 'results' && results.length > 0)

  const summary =
    status === 'loading'
      ? 'buscando…'
      : status === 'results'
        ? `${filteredFlights.length} de ${results.length} voos`
        : status === 'error'
          ? 'erro na busca'
          : 'nenhuma busca ainda'

  return (
    <div className="flex min-h-screen flex-col">
      <Header onSelectSavedSearch={handleSelectSaved} />

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
                Tarifas reais de companhias aéreas, atualizadas a cada busca.
              </p>
            </div>
            <SearchBar key={formKey} initialParams={params} loading={loading} onSearch={runSearch} />
            {hint && (
              <p role="status" className="mt-10 text-center text-sm font-medium text-white">
                {hint}
              </p>
            )}
          </div>
        </section>

        {/* Results */}
        <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                {shown.origin.city}
                <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {shown.destination.city}
              </h2>
              <p role="status" aria-live="polite" className="text-sm text-slate-500">
                {dateSummary ? `${dateSummary} · ` : ''}
                {summary}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!searchedParams || savedId !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savedId ? (
                  <BookmarkCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                ) : (
                  <Bookmark className="h-4 w-4" aria-hidden="true" />
                )}
                {savedId ? 'Busca salva' : 'Salvar busca'}
              </button>
              {showSidebar && (
                <button
                  type="button"
                  onClick={() => setShowMobileFilters((current) => !current)}
                  aria-expanded={showMobileFilters}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 lg:hidden"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Filtros
                </button>
              )}
            </div>
          </div>

          {status === 'idle' && (
            <StatePanel
              icon={<PlaneTakeoff className="h-7 w-7 text-indigo-600" aria-hidden="true" />}
              title="Pronto para buscar"
              text="Escolha origem, destino e datas e clique em “Buscar voos” para ver as tarifas disponíveis."
            />
          )}

          {status === 'error' && (
            <StatePanel
              icon={<AlertTriangle className="h-7 w-7 text-red-500" aria-hidden="true" />}
              title="Não foi possível concluir a busca"
              text={errorMessage}
              action={
                searchedParams ? { label: 'Tentar novamente', onClick: () => runSearch(searchedParams) } : undefined
              }
            />
          )}

          {status === 'results' && results.length === 0 && (
            <StatePanel
              icon={<SearchX className="h-7 w-7 text-slate-400" aria-hidden="true" />}
              title="Nenhuma oferta para esta busca"
              text="Não encontramos voos para essa rota e datas. Tente outras datas ou aeroportos próximos."
            />
          )}

          {showSidebar && (
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
                      Buscando tarifas atualizadas…
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
                      <StatePanel
                        icon={<SearchX className="h-7 w-7 text-slate-400" aria-hidden="true" />}
                        title="Nenhum voo corresponde aos filtros"
                        text="Tente ampliar o preço máximo ou incluir mais companhias e horários."
                        action={{ label: 'Limpar filtros', onClick: () => setFilters(buildDefaultFilters(results)) }}
                      />
                    ) : (
                      sortedFlights.map((flight) => (
                        <FlightCard
                          key={flight.id}
                          flight={flight}
                          passengerCount={passengerCount}
                          isCheapest={flight.id === cheapestId}
                          isFastest={flight.id === fastestId}
                          onViewOffer={setOffer}
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

      {offer && (
        <OfferDialog
          flight={offer}
          passengerCount={passengerCount}
          onClose={() => setOffer(null)}
          onResearch={() => {
            setOffer(null)
            if (searchedParams) runSearch(searchedParams)
          }}
        />
      )}
    </div>
  )
}

interface StatePanelProps {
  icon: React.ReactNode
  title: string
  text: string
  action?: { label: string; onClick: () => void }
}

function StatePanel({ icon, title, text, action }: StatePanelProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">{icon}</span>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
