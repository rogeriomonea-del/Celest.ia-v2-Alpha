import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  FlaskConical,
  Plane,
  PlaneTakeoff,
  SearchX,
  SlidersHorizontal,
} from 'lucide-react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { FlightCard } from './components/FlightCard'
import { FilterSidebar } from './components/FilterSidebar'
import { OfferDialog } from './components/OfferDialog'
import { MilesControl } from './components/MilesControl'
import {
  FilterSidebarSkeleton,
  FlightCardSkeleton,
  SortTabsSkeleton,
} from './components/Skeletons'
import { findAirport } from './data/airports'
import { ApiError, searchFlights, UNREACHABLE_MESSAGE } from './lib/api'
import { useAuth } from './auth/context'
import { useSavedSearches } from './features/savedSearches/useSavedSearches'
import type { SavedSearch } from './features/savedSearches/types'
import { useMilesPrefs, type MilesPrefs } from './features/miles/useMilesPrefs'
import { applyFilters, sortFlights } from './utils/flightLogic'
import { addDays, fromISODate, startOfDay, toISODate } from './utils/dates'
import { formatShortDate } from './utils/format'
import type { MilesSummary } from './shared/api'
import type { Filters, Flight, SearchParams, SortKey } from './types'

const SKELETON_COUNT = 5
/** Slider bounds snap to this step so the true max/min stay reachable. */
const PRICE_STEP = 50

type Status = 'idle' | 'loading' | 'error' | 'results'

const PAST_DATES_HINT = 'As datas desta busca já passaram. Escolha novas datas e busque novamente.'

/** Search the user asked to save while logged out; survives the OAuth redirect. */
export const PENDING_SAVE_KEY = 'celestia:pendingSave'

const airportSchema = z.object({ code: z.string(), city: z.string(), name: z.string(), country: z.string() })
const pendingSaveSchema = z.object({
  origin: airportSchema,
  destination: airportSchema,
  departDate: z.string().nullable(),
  returnDate: z.string().nullable(),
  passengers: z.object({
    adults: z.number().int(),
    children: z.number().int(),
    infants: z.number().int(),
  }),
  tripType: z.enum(['roundtrip', 'oneway']),
  cabin: z.enum(['economy', 'premium', 'business']),
})

function storePendingSave(params: SearchParams) {
  try {
    const stored: z.infer<typeof pendingSaveSchema> = {
      ...params,
      departDate: params.departDate ? toISODate(params.departDate) : null,
      returnDate: params.returnDate ? toISODate(params.returnDate) : null,
    }
    window.sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(stored))
  } catch {
    // Storage unavailable (private mode, quota): the save is simply not resumed.
  }
}

function clearPendingSave() {
  try {
    window.sessionStorage.removeItem(PENDING_SAVE_KEY)
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** Reads and removes the pending save. Returns null when absent or invalid. */
function takePendingSave(): SearchParams | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SAVE_KEY)
    if (raw === null) return null
    window.sessionStorage.removeItem(PENDING_SAVE_KEY)
    const stored = pendingSaveSchema.parse(JSON.parse(raw))
    return {
      ...stored,
      departDate: stored.departDate ? fromISODate(stored.departDate) : null,
      returnDate: stored.returnDate ? fromISODate(stored.returnDate) : null,
    }
  } catch {
    return null
  }
}

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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [totalOffers, setTotalOffers] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [liveMode, setLiveMode] = useState(true)
  const [offer, setOffer] = useState<Flight | null>(null)
  const [milesSummary, setMilesSummary] = useState<MilesSummary | null>(null)
  const { prefs: milesPrefs, setPrefs: setMilesPrefs } = useMilesPrefs()
  // Read by runSearch, so a search started right after Apply uses the new prefs.
  const milesPrefsRef = useRef(milesPrefs)
  milesPrefsRef.current = milesPrefs
  const controllerRef = useRef<AbortController | null>(null)
  // Bumped on every search, so a save that resolves late can tell it is stale.
  const searchSeqRef = useRef(0)
  const { user, loginOpen } = useAuth()
  const userId = user?.id ?? null
  const wasLoginOpenRef = useRef(false)
  const { save, loaded: savedListLoaded } = useSavedSearches()
  const loading = status === 'loading'

  const runSearch = useCallback((nextParams: SearchParams) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    searchSeqRef.current += 1
    // A new search abandons any save that was waiting for login.
    clearPendingSave()
    setParams(nextParams)
    setSearchedParams(nextParams)
    setSavedId(null)
    setSaveError(null)
    setHint(null)
    setStatus('loading')
    const miles = milesPrefsRef.current
    // Prefs travel only when the miles module is on.
    const request = miles.enabled
      ? searchFlights(nextParams, controller.signal, miles)
      : searchFlights(nextParams, controller.signal)
    request.then(
      (response) => {
        if (controller.signal.aborted) return
        const { offers } = response
        setResults(offers)
        setTotalOffers(response.totalOffers)
        setTruncated(response.truncated)
        setLiveMode(response.liveMode)
        setMilesSummary(response.miles)
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
        setHint(PAST_DATES_HINT)
        return
      }
      setFormKey((key) => key + 1)
      runSearch(saved.params)
    },
    [runSearch],
  )

  /** Saves `target`; the result is applied only if no search ran meanwhile. */
  const saveSearch = useCallback(
    async (target: SearchParams) => {
      const seq = searchSeqRef.current
      setSaveError(null)
      const result = await save(target)
      if (searchSeqRef.current !== seq) return
      if (result.status === 'saved') setSavedId(result.saved.id)
      else if (result.status === 'error') setSaveError(result.message)
    },
    [save],
  )

  const handleMilesApply = (next: MilesPrefs) => {
    setMilesPrefs(next)
    milesPrefsRef.current = next
    if (status !== 'idle' && searchedParams) runSearch(searchedParams)
  }

  const handleSave = async () => {
    if (!searchedParams) return
    // save() opens the OAuth login, which leaves the page: keep the search to resume it.
    if (!userId) storePendingSave(searchedParams)
    await saveSearch(searchedParams)
  }

  // Login dialog dismissed without signing in: the pending save is abandoned.
  useEffect(() => {
    if (wasLoginOpenRef.current && !loginOpen && !userId) clearPendingSave()
    wasLoginOpenRef.current = loginOpen
  }, [loginOpen, userId])

  // Back from login with a pending save: restore that search, run it and save it.
  // save() finds an identical search only in the loaded list, so resuming before
  // the user's list is in would insert a duplicate of a search saved earlier.
  useEffect(() => {
    if (!userId || !savedListLoaded) return
    const pending = takePendingSave()
    if (!pending) return
    const today = startOfDay(new Date())
    if (!pending.departDate || pending.departDate < today) {
      setParams({ ...pending, departDate: null, returnDate: null })
      setFormKey((key) => key + 1)
      setHint(PAST_DATES_HINT)
      return
    }
    setFormKey((key) => key + 1)
    runSearch(pending)
    void saveSearch(pending)
  }, [userId, savedListLoaded, runSearch, saveSearch])

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
        ? `${filteredFlights.length} de ${results.length} voos` +
          (truncated ? ` · Mostrando ${results.length} de ${totalOffers} ofertas` : '')
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
                Compare tarifas de companhias aéreas e encontre o melhor voo.
              </p>
            </div>
            <SearchBar
              key={formKey}
              initialParams={params}
              loading={loading}
              onSearch={runSearch}
              extraControl={<MilesControl prefs={milesPrefs} onApply={handleMilesApply} />}
            />
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
            <div className="flex flex-wrap items-center gap-2">
              {saveError && (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {saveError}
                </p>
              )}
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

          {status === 'results' && milesPrefs.enabled && milesSummary?.awardsNote && (
            <p role="note" className="mb-5 text-sm text-slate-500">
              Awards: {milesSummary.awardsNote}
            </p>
          )}

          {status === 'results' && !liveMode && (
            <p
              role="note"
              className="mb-5 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
            >
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
              Modo de teste: preços fictícios, apenas para demonstração.
            </p>
          )}

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
                          milheiro={milesSummary?.milheiroBrl ?? null}
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
          milheiro={milesSummary?.milheiroBrl ?? null}
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
