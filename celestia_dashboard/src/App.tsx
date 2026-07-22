import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Cpu,
  FlaskConical,
  Plane,
  Route,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { CoordinateRuler } from './components/CoordinateRuler'
import { LiveIntelligence } from './components/LiveIntelligence'
import { NebulaGlobe } from './components/NebulaGlobe'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { FlightCard } from './components/FlightCard'
import { FilterSidebar } from './components/FilterSidebar'
import { StrategyPanel } from './components/StrategyPanel'
import { FilterSidebarSkeleton, FlightCardSkeleton, SortTabsSkeleton } from './components/Skeletons'
import { findAirport } from './data/airports'
import { buildFlights } from './data/flights'
import { fetchApiMode, searchJourney, searchTravel } from './api'
import { applyFilters, sortFlights } from './utils/flightLogic'
import { addDays, startOfDay } from './utils/dates'
import { formatBRL, formatShortDate } from './utils/format'
import type {
  ApiMode,
  Filters,
  Flight,
  JourneyResult,
  LegView,
  SearchLeg,
  SearchParams,
  SearchResult,
  SortKey,
} from './types'

const DEMO_LATENCY_MS = 900
const SKELETON_COUNT = 4
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
    legs: [],
  }
}

function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const EMPTY_STATS = {
  candidatesTotal: 0,
  candidatesScraped: 0,
  scrapesSavedByPrefilter: 0,
  subagentsSpawned: 0,
  durationSeconds: 0,
}

/** Demonstração local e determinística da jornada (modo off/fallback demo). */
function buildLocalJourney(params: SearchParams, legs: SearchLeg[]): JourneyResult {
  const legViews: LegView[] = legs.map((leg, index) => {
    const flights = buildFlights(leg.origin.code, leg.destination.code, params.cabin)
    return {
      mode: 'mock',
      flights,
      strategies: [],
      quotes: [],
      stats: { ...EMPTY_STATS },
      agentLog: [],
      lastResort: null,
      offersReceived: flights.length,
      indicativeOffers: 0,
      legIndex: index,
      origin: leg.origin.code,
      destination: leg.destination.code,
      requestedDepart: leg.departDate ? toIsoDay(leg.departDate) : '',
      status: 'ok',
      error: null,
    }
  })
  // combinações demo: 1º e 2º voo mais baratos de cada trecho, somas honestas
  const picks = legViews.map((leg) =>
    [...leg.flights].sort((a, b) => a.price - b.price).slice(0, 2),
  )
  const itineraries = picks.every((options) => options.length > 0)
    ? [0, 1]
        .filter((choice) => picks.every((options) => options[choice] ?? options[0]))
        .map((choice, rankIndex) => {
          const selections = picks.map((options, legIndex) => {
            const flight = options[choice] ?? options[0]
            return {
              legIndex,
              flightId: flight.id,
              optionKey: null,
              strategy: 'indicative_cash',
              bookingUrl: flight.bookingUrl ?? '',
            }
          })
          const cash = picks.reduce(
            (total, options) => total + (options[choice] ?? options[0]).price,
            0,
          )
          return {
            id: `demo-${choice}`,
            rank: rankIndex + 1,
            priceBasis: 'perPassenger' as const,
            selections,
            cashBrl: cash,
            miles: 0,
            effectiveTotalBrl: cash,
            milesShortfall: 0,
            notes: [
              'Demonstração local — combinação de trechos reservados separadamente.',
            ],
          }
        })
    : []
  return {
    mode: 'mock',
    searchType: 'multiCity',
    pricingScope: 'independentLegs',
    partial: false,
    legs: legViews,
    itineraries,
    stats: {
      ...EMPTY_STATS,
      legsTotal: legViews.length,
      legsSucceeded: legViews.length,
      legsEmpty: 0,
      legsFailed: 0,
    },
    agentLog: [],
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

function SearchNotice({
  apiMode,
  report,
  error,
}: {
  apiMode: ApiMode | null
  report: SearchResult | null
  error: string | null
}) {
  if (error) {
    return (
      <div role="alert" className="telemetry-strip telemetry-strip--error flex items-start gap-3 px-4 py-3.5 text-sm text-red-100 sm:px-5">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
        <div>
          <strong className="font-bold">A busca real não foi concluída.</strong>
          <p className="mt-0.5 leading-relaxed text-red-100/80">{error}</p>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div role="status" className="telemetry-strip telemetry-strip--demo flex items-start gap-3 px-4 py-3.5 text-sm text-gold-100 sm:px-5">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" aria-hidden="true" />
        <div>
          <strong className="font-bold">{apiMode === 'off' ? 'Demonstração local.' : 'Modo demonstração.'}</strong>
          <p className="mt-0.5 leading-relaxed text-space-100/75">Os voos desta tela são simulações locais. Nenhuma tarifa fictícia será misturada a uma busca real.</p>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="telemetry-strip telemetry-strip--online px-4 py-3.5 text-sm text-space-100 sm:px-5">
      <div className="flex items-start gap-3">
        <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-aqua-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <strong className="font-bold">{report.mode === 'real' ? 'Análise real concluída.' : 'Motor conectado em modo demonstração.'}</strong>
          <p className="mt-0.5 leading-relaxed text-space-100/75">
            {report.offersReceived} oferta(s) recebida(s) de {report.stats.candidatesTotal} candidatos em {report.stats.durationSeconds}s.
            {report.indicativeOffers > 0 && ` ${report.indicativeOffers} tarifa(s) indicativa(s), identificadas nos cards.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-aqua-200/15 pt-2.5 text-[11px] font-semibold text-aqua-100/75">
            <span>{report.stats.candidatesScraped} candidatos verificados</span>
            <span>{report.stats.scrapesSavedByPrefilter} consultas poupadas</span>
            <span>{report.stats.subagentsSpawned} agentes acionados</span>
            <span>{report.quotes.length} cotações de referência</span>
            <span>{report.agentLog.length} eventos de análise</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function legStrategyLabel(journey: JourneyResult, legIndex: number, strategy: string): string {
  const found = journey.legs[legIndex]?.strategies.find((s) => s.strategy === strategy)?.label
  if (found) return found
  if (strategy === 'indicative_cash') return 'Tarifa indicativa (dinheiro)'
  return strategy
}

function JourneyNotice({ journey }: { journey: JourneyResult }) {
  const stats = journey.stats
  return (
    <div role="status" className="telemetry-strip telemetry-strip--online px-4 py-3.5 text-sm text-space-100 sm:px-5">
      <div className="flex items-start gap-3">
        <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-aqua-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <strong className="font-bold">
            {journey.mode === 'real' ? 'Jornada analisada pelo motor.' : 'Jornada em modo demonstração.'}
            {journey.partial && ' Resultado parcial.'}
          </strong>
          <p className="mt-0.5 leading-relaxed text-space-100/75">
            {stats.legsSucceeded + stats.legsEmpty} de {stats.legsTotal} trecho(s) responderam em {stats.durationSeconds}s.{' '}
            {journey.itineraries.length > 0
              ? `${journey.itineraries.length} combinação(ões) de jornada calculada(s).`
              : 'Sem combinações completas — veja cada trecho abaixo.'}{' '}
            Valores por passageiro; trechos reservados separadamente (sem PNR único ou conexão protegida).
          </p>
          {stats.legsFailed > 0 && (
            <p className="mt-1 text-[12px] font-semibold text-gold-200">
              {stats.legsFailed} trecho(s) com falha/timeout — os demais foram preservados.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function JourneyItinerariesPanel({ journey }: { journey: JourneyResult }) {
  if (journey.itineraries.length === 0) return null
  const shown = journey.itineraries.slice(0, 5)
  return (
    <section aria-label="Melhores combinações da jornada" className="nebula-panel mt-6 overflow-hidden">
      <div className="border-b border-space-100/10 px-5 py-4 sm:px-6">
        <p className="system-kicker">Cálculo de decisão · jornada completa</p>
        <h3 className="mt-1 font-serif text-2xl font-light text-[#f5ecdd]">Melhores combinações</h3>
      </div>
      <ol className="divide-y divide-space-100/10">
        {shown.map((itinerary) => (
          <li key={itinerary.id} className="grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[3rem_minmax(0,1fr)_auto] lg:items-center">
            <span aria-hidden="true" className="hidden h-10 w-10 items-center justify-center rounded-full border border-gold-300/40 font-mono text-sm font-bold text-gold-200 lg:flex">
              {itinerary.rank}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {itinerary.selections.map((selection) => {
                  const leg = journey.legs[selection.legIndex]
                  const label = legStrategyLabel(journey, selection.legIndex, selection.strategy)
                  const chip = (
                    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-space-100/15 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-space-100/85">
                      <span className="font-mono text-aqua-200">T{selection.legIndex + 1}</span>
                      {leg ? `${leg.origin}→${leg.destination}` : ''} · {label}
                      {selection.bookingUrl && <ArrowUpRight className="h-3 w-3 text-aqua-200" aria-hidden="true" />}
                    </span>
                  )
                  return selection.bookingUrl ? (
                    <a
                      key={`${itinerary.id}-${selection.legIndex}`}
                      href={selection.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir reserva do trecho ${selection.legIndex + 1}; abre em nova aba`}
                      className="transition-opacity hover:opacity-80"
                    >
                      {chip}
                    </a>
                  ) : (
                    <span key={`${itinerary.id}-${selection.legIndex}`}>{chip}</span>
                  )
                })}
              </div>
              <p className="tnum mt-2 text-[11px] text-space-100/60">
                {itinerary.miles > 0
                  ? `${formatBRL(Math.round(itinerary.cashBrl))} em dinheiro + ${itinerary.miles.toLocaleString('pt-BR')} milhas · por passageiro`
                  : 'tudo em dinheiro · por passageiro'}
                {itinerary.milesShortfall > 0 &&
                  ` · faltam ${itinerary.milesShortfall.toLocaleString('pt-BR')} milhas no seu saldo`}
              </p>
              {itinerary.notes.length > 0 && (
                <p className="mt-1 text-[10px] leading-relaxed text-space-200/55">{itinerary.notes.join(' ')}</p>
              )}
            </div>
            <div className="text-left lg:text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-space-200/50">Custo efetivo total</p>
              <p className="tnum font-serif text-2xl font-light text-[#f5ecdd]">{formatBRL(Math.round(itinerary.effectiveTotalBrl))}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

const LEG_STATUS_META: Record<string, { dot: string; label: string }> = {
  ok: { dot: 'bg-aqua-300 shadow-[0_0_10px_rgba(85,230,230,.7)]', label: 'ok' },
  empty: { dot: 'bg-gold-300', label: 'sem tarifas' },
  failed: { dot: 'bg-red-400', label: 'falhou' },
  timeout: { dot: 'bg-red-400', label: 'expirou' },
}

function JourneyLegTabs({
  journey,
  activeLeg,
  onSelect,
}: {
  journey: JourneyResult
  activeLeg: number
  onSelect: (index: number) => void
}) {
  const roundtripLabels = journey.legs.length === 2 &&
    journey.legs[0].origin === journey.legs[1].destination &&
    journey.legs[0].destination === journey.legs[1].origin
  return (
    <div role="group" aria-label="Trechos da jornada" className="mt-6 flex flex-wrap gap-2">
      {journey.legs.map((leg, index) => {
        const meta = LEG_STATUS_META[leg.status] ?? LEG_STATUS_META.ok
        const isActive = index === activeLeg
        const name = roundtripLabels ? (index === 0 ? 'Ida' : 'Volta') : `Trecho ${index + 1}`
        return (
          <button
            key={leg.legIndex}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(index)}
            className={`inline-flex min-h-11 items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'border-aqua-200/60 bg-aqua-300/[0.1] text-aqua-100'
                : 'border-space-100/15 bg-white/[0.03] text-space-100/75 hover:border-space-100/30 hover:text-white'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            {name} · {leg.origin}→{leg.destination}
            <span className="tnum text-[10px] font-normal text-space-200/70">{leg.requestedDepart}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function App() {
  const [params, setParams] = useState<SearchParams>(buildDefaultSearch)
  const [results, setResults] = useState<Flight[]>([])
  const [filters, setFilters] = useState<Filters | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('best')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [report, setReport] = useState<SearchResult | null>(null)
  const [journey, setJourney] = useState<JourneyResult | null>(null)
  const [activeLeg, setActiveLeg] = useState(0)
  /** Filtros/ordenação POR TRECHO: mudar de aba não destrói o estado dos outros. */
  const [legUi, setLegUi] = useState<Record<number, { filters: Filters | null; sortKey: SortKey }>>({})
  const [apiMode, setApiMode] = useState<ApiMode | null>(null)
  const [idle, setIdle] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const apiModeRef = useRef<ApiMode>('off')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const searchSeq = useRef(0)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const closeFilterRef = useRef<HTMLButtonElement>(null)

  const applySearch = useCallback(
    (seq: number, flights: Flight[], nextReport: SearchResult | null, error: string | null = null) => {
      if (seq !== searchSeq.current) return
      setJourney(null)
      setReport(nextReport)
      setSearchError(error)
      setResults(flights)
      setFilters(buildDefaultFilters(flights))
      setSortKey('best')
      setLoading(false)
    },
    [],
  )

  const applyJourney = useCallback((seq: number, nextJourney: JourneyResult) => {
    if (seq !== searchSeq.current) return
    setReport(null)
    setResults([])
    setFilters(null)
    setSearchError(null)
    setJourney(nextJourney)
    setActiveLeg(0)
    setLegUi(
      Object.fromEntries(
        nextJourney.legs.map((leg) => [
          leg.legIndex,
          { filters: buildDefaultFilters(leg.flights), sortKey: 'best' as SortKey },
        ]),
      ),
    )
    setLoading(false)
  }, [])

  const runSearch = useCallback(
    (nextParams: SearchParams) => {
      setParams(nextParams)
      setIdle(false)
      setSearchError(null)
      setLoading(true)
      setShowMobileFilters(false)
      const seq = ++searchSeq.current
      clearTimeout(searchTimer.current)

      // ida-e-volta agora pesquisa os DOIS sentidos: vira uma jornada de 2
      // trechos na mesma infraestrutura do multidestinos
      const journeyLegs: SearchLeg[] | null =
        nextParams.tripType === 'multicity'
          ? nextParams.legs
          : nextParams.tripType === 'roundtrip' && nextParams.returnDate
            ? [
                {
                  origin: nextParams.origin,
                  destination: nextParams.destination,
                  departDate: nextParams.departDate,
                },
                {
                  origin: nextParams.destination,
                  destination: nextParams.origin,
                  departDate: nextParams.returnDate,
                },
              ]
            : null

      const showLocalDemo = () => {
        searchTimer.current = setTimeout(() => {
          if (journeyLegs) {
            applyJourney(seq, buildLocalJourney(nextParams, journeyLegs))
          } else {
            applySearch(
              seq,
              buildFlights(nextParams.origin.code, nextParams.destination.code, nextParams.cabin),
              null,
            )
          }
        }, DEMO_LATENCY_MS)
      }

      // Se /api/status já confirmou que não há motor, não aguardamos o timeout
      // longo da busca real: a demonstração local entra diretamente.
      if (apiModeRef.current === 'off') {
        showLocalDemo()
        return
      }

      const failHonestly = (error: unknown) => {
        if (seq !== searchSeq.current) return
        setJourney(null)
        applySearch(
          seq,
          [],
          null,
          error instanceof Error ? error.message : 'A busca falhou sem um diagnóstico legível.',
        )
      }

      if (journeyLegs) {
        searchJourney(nextParams, journeyLegs)
          .then((nextJourney) => applyJourney(seq, nextJourney))
          .catch((error: unknown) => {
            if (apiModeRef.current === 'real') {
              failHonestly(error)
              return
            }
            showLocalDemo()
          })
        return
      }

      searchTravel(nextParams)
        .then((nextReport) => applySearch(seq, nextReport.flights, nextReport))
        .catch((error: unknown) => {
          if (apiModeRef.current === 'real') {
            failHonestly(error)
            return
          }
          showLocalDemo()
        })
    },
    [applySearch, applyJourney],
  )

  useEffect(() => {
    let cancelled = false
    fetchApiMode().then((mode) => {
      if (cancelled) return
      apiModeRef.current = mode
      setApiMode(mode)
      if (mode === 'real') {
        setIdle(true)
        setLoading(false)
      } else {
        runSearch(buildDefaultSearch())
      }
    })
    return () => {
      cancelled = true
      searchSeq.current += 1
      clearTimeout(searchTimer.current)
    }
  }, [runSearch])

  useEffect(() => {
    if (!showMobileFilters) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeFilterRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMobileFilters(false)
        filterButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showMobileFilters])

  const userSearchedRef = useRef(false)
  const handleUserSearch = useCallback(
    (nextParams: SearchParams) => {
      userSearchedRef.current = true
      runSearch(nextParams)
      requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        document.getElementById('resultados')?.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        })
      })
    },
    [runSearch],
  )

  useEffect(() => {
    if (!userSearchedRef.current) return
    document.title =
      params.tripType === 'multicity'
        ? `Jornada multidestinos (${params.legs.length} trechos) | celest.ia`
        : `Voos ${params.origin.city} (${params.origin.code}) → ${params.destination.city} (${params.destination.code}) | celest.ia`
  }, [params.origin, params.destination, params.tripType, params.legs.length])

  // conjunto ATIVO: o trecho selecionado da jornada, ou a busca simples
  const activeLegView = journey ? (journey.legs[activeLeg] ?? null) : null
  const activeFlights = activeLegView ? activeLegView.flights : results
  const activeFilters = activeLegView ? (legUi[activeLeg]?.filters ?? null) : filters
  const activeSortKey = activeLegView ? (legUi[activeLeg]?.sortKey ?? 'best') : sortKey

  const setActiveFilters = useCallback(
    (next: Filters) => {
      if (journey) {
        setLegUi((current) => ({
          ...current,
          [activeLeg]: { filters: next, sortKey: current[activeLeg]?.sortKey ?? 'best' },
        }))
      } else {
        setFilters(next)
      }
    },
    [journey, activeLeg],
  )
  const setActiveSortKey = useCallback(
    (next: SortKey) => {
      if (journey) {
        setLegUi((current) => ({
          ...current,
          [activeLeg]: { filters: current[activeLeg]?.filters ?? null, sortKey: next },
        }))
      } else {
        setSortKey(next)
      }
    },
    [journey, activeLeg],
  )

  const priceBounds = useMemo(() => {
    if (activeFlights.length === 0) return { min: 0, max: 0 }
    const prices = activeFlights.map((flight) => flight.price)
    return {
      min: Math.floor(Math.min(...prices) / PRICE_STEP) * PRICE_STEP,
      max: Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP,
    }
  }, [activeFlights])

  const filteredFlights = useMemo(
    () => (activeFilters ? applyFilters(activeFlights, activeFilters) : activeFlights),
    [activeFlights, activeFilters],
  )
  const sortedFlights = useMemo(
    () => sortFlights(filteredFlights, activeSortKey),
    [filteredFlights, activeSortKey],
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

  // trechos projetados no globo do hero: jornada explícita OU ida-e-volta
  // (que internamente também é uma jornada de 2 trechos)
  const globeLegs = useMemo(() => {
    if (params.tripType === 'multicity' && params.legs.length >= 2) {
      return params.legs.map((leg) => ({ origin: leg.origin, destination: leg.destination }))
    }
    if (journey && params.tripType === 'roundtrip') {
      return [
        { origin: params.origin, destination: params.destination },
        { origin: params.destination, destination: params.origin },
      ]
    }
    return null
  }, [params, journey])
  const journeyLegsForHeader = params.tripType === 'multicity' ? params.legs : null
  const headerOrigin = journeyLegsForHeader?.[0]?.origin ?? params.origin
  const headerDestination =
    journeyLegsForHeader?.[journeyLegsForHeader.length - 1]?.destination ?? params.destination
  const dateSummary =
    params.tripType === 'multicity'
      ? `${params.legs.length} trechos`
      : params.returnDate
        ? `${formatShortDate(params.departDate)} – ${formatShortDate(params.returnDate)}`
        : formatShortDate(params.departDate)

  return (
    <div id="topo" className="flex min-h-screen flex-col bg-space-950 text-space-100">
      <a href="#resultados" className="sr-only z-[100] rounded bg-aqua-100 px-4 py-3 text-space-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Ir para os resultados
      </a>
      <Header apiMode={apiMode} />

      <main className="flex-1">
        <section className="nebula-hero starfield relative overflow-hidden border-b border-white/10 text-white">
          <CoordinateRuler />
          <div aria-hidden="true" className="hero-cartography absolute inset-0" />
          <div aria-hidden="true" className="hero-nebula absolute inset-x-0 bottom-0 h-2/3" />

          <div className="hero-copy relative z-20">
            <p className="text-[9px] font-bold uppercase tracking-[0.31em] text-aqua-300">
              Navegação inteligente · Beta
            </p>
            <h1 className="mt-6 max-w-[28rem] font-serif text-[3.25rem] font-light leading-[0.98] tracking-[-0.052em] text-[#f5ecdd] sm:text-[4.15rem] lg:text-[4.55rem]">
              <span className="block">A viagem</span>
              <span className="block">começa antes</span>
              <span className="block">do destino</span>
            </h1>
            <p className="mt-5 max-w-[23.5rem] text-[0.93rem] leading-[1.7] text-space-100/70">
              celest.ia conecta rotas, contexto e possibilidades para desenhar a jornada certa — antes de você decidir como chegar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-8">
              <button
                type="submit"
                form="buscar"
                disabled={loading}
                className="hero-primary-cta group inline-flex min-h-[3.65rem] items-center gap-4 rounded-2xl border border-aqua-300/70 bg-aqua-300/[0.055] px-5 text-sm font-medium text-aqua-100 transition-all hover:-translate-y-0.5 hover:border-aqua-200 hover:bg-aqua-300/[0.1] disabled:cursor-wait disabled:opacity-55"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40">
                  <Route className="h-[1.15rem] w-[1.15rem] -rotate-12" aria-hidden="true" />
                </span>
                Traçar jornada
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </button>
              <a href="#estrategias" className="hero-secondary-cta min-h-11 border-b border-space-100/40 py-3 text-sm text-space-100/75 transition-colors hover:border-aqua-200 hover:text-aqua-100">
                Ver como funciona
              </a>
            </div>
          </div>

          <div className="hero-globe absolute z-10">
            <NebulaGlobe
              origin={params.origin}
              destination={params.destination}
              legs={globeLegs}
              activeLeg={activeLeg}
            />
          </div>

          <div className="hero-search relative z-30">
            <SearchBar initialParams={params} loading={loading} apiMode={apiMode} onSearch={handleUserSearch} />
          </div>

          <div className="hero-intelligence relative z-30">
            <LiveIntelligence
              apiMode={apiMode}
              params={params}
              report={report}
              journey={journey}
              loading={loading}
              idle={idle}
              error={searchError}
            />
          </div>
        </section>

        <section id="resultados" className="nebula-results relative scroll-mt-24 overflow-hidden pb-20 pt-12 sm:pb-28 sm:pt-16">
          <div aria-hidden="true" className="results-cartography absolute inset-0" />
          <div aria-hidden="true" className="results-orbit results-orbit--one" />
          <div aria-hidden="true" className="results-orbit results-orbit--two" />
          <div className="results-shell relative mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-space-100/10 pb-6">
              <div>
                <p className="system-kicker">
                  {params.tripType === 'multicity'
                    ? `Mapa de possibilidades · jornada de ${params.legs.length} trechos`
                    : `Mapa de possibilidades · setor ${headerOrigin.code}/${headerDestination.code}`}
                </p>
                <h2 className="mt-2 flex flex-wrap items-center gap-2.5 font-serif text-3xl font-light tracking-[-0.035em] text-[#f5ecdd] sm:text-4xl lg:text-[2.65rem]">
                  {headerOrigin.city}<ArrowRight className="h-5 w-5 text-gold-300" aria-hidden="true" />{headerDestination.city}
                </h2>
                <p role="status" aria-live="polite" className="mt-2 text-sm text-space-100/65">
                  {dateSummary} · {idle ? 'pronto para iniciar' : loading ? 'analisando possibilidades…' : searchError ? 'busca não concluída' : `${filteredFlights.length} de ${activeFlights.length} opções${journey ? ` no trecho ${activeLeg + 1}` : ''}`}
                </p>
              </div>
              <div aria-hidden="true" className="hidden text-right lg:block">
                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-space-200/45">Vetor de navegação</p>
                <p className="tnum mt-1 font-serif text-xl font-light text-space-100/80">
                  {params.tripType === 'multicity'
                    ? params.legs.map((leg) => leg.origin.code).concat(headerDestination.code).join(' — ')
                    : `${headerOrigin.code} — ${headerDestination.code}`}
                </p>
                <div className="mt-2 ml-auto h-px w-32 bg-gradient-to-r from-transparent via-aqua-300/60 to-gold-300/60" />
              </div>
              {!idle && !loading && !searchError && activeFlights.length > 0 && (
                <button
                  ref={filterButtonRef}
                  type="button"
                  onClick={() => setShowMobileFilters(true)}
                  aria-expanded={showMobileFilters}
                  aria-controls="mobile-filters"
                  className="secondary-button lg:hidden"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filtros
                </button>
              )}
            </div>

            {!loading && !idle && (
              journey && !searchError
                ? <JourneyNotice journey={journey} />
                : <SearchNotice apiMode={apiMode} report={report} error={searchError} />
            )}

            {!loading && !idle && !searchError && journey && (
              <>
                <JourneyItinerariesPanel journey={journey} />
                <JourneyLegTabs journey={journey} activeLeg={activeLeg} onSelect={setActiveLeg} />
                {activeLegView?.error && (
                  <div role="alert" className="telemetry-strip telemetry-strip--error mt-4 flex items-start gap-3 px-4 py-3.5 text-sm text-red-100 sm:px-5">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <strong className="font-bold">
                        Trecho {activeLeg + 1} {activeLegView.status === 'timeout' ? 'expirou' : 'falhou'} ({activeLegView.error.code}).
                      </strong>
                      <p className="mt-0.5 leading-relaxed text-red-100/80">{activeLegView.error.message}</p>
                      {activeLegView.lastResort && (
                        <a
                          href={activeLegView.lastResort.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir busca pronta deste trecho no Google Flights; abre em nova aba"
                          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold text-aqua-200 hover:text-aqua-100"
                        >
                          Abrir busca pronta deste trecho <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div id="estrategias" className="scroll-mt-28">
              {!loading && !idle && !searchError && !journey && report && report.strategies.length > 0 && (
                <div className="mt-8"><StrategyPanel options={report.strategies} /></div>
              )}
              {!loading && !idle && !searchError && journey && activeLegView && activeLegView.strategies.length > 0 && (
                <div className="mt-8"><StrategyPanel options={activeLegView.strategies} /></div>
              )}
            </div>

            {idle && (
              <div className="nebula-panel mt-6 grid overflow-hidden lg:grid-cols-[1fr_.7fr]">
                <div className="p-6 sm:p-10">
                  <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-aqua-200/25 bg-aqua-300/[0.06] shadow-orbit"><Cpu className="h-6 w-6 text-aqua-200" aria-hidden="true" /></span>
                  <p className="system-kicker mb-2">Sistema em espera</p>
                  <h3 className="font-serif text-2xl font-light text-[#f5ecdd]">Motor conectado. A decisão continua sendo sua.</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-space-100/65">A busca real aciona várias fontes e pode consumir alguns minutos. Ajuste a rota acima e clique em “Buscar voos” quando estiver pronto.</p>
                </div>
                <div className="relative hidden min-h-64 overflow-hidden border-l border-space-100/10 bg-space-950/55 lg:block">
                  <div className="starfield absolute inset-0 opacity-45" /><div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-aqua-200/15" /><div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold-200/20" /><span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-aqua-200 shadow-orbit" />
                </div>
              </div>
            )}

            {searchError && !loading && !idle && (
              <div className="nebula-panel nebula-panel--error mt-6 flex flex-col items-center px-6 py-12 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-300/25 bg-red-400/[0.07]"><CircleAlert className="h-6 w-6 text-red-300" aria-hidden="true" /></span>
                <p className="system-kicker system-kicker--error mb-2">Rota interrompida</p>
                <h3 className="font-serif text-2xl font-light text-[#f5ecdd]">Nenhum dado fictício foi colocado no lugar.</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-space-100/65">O diagnóstico acima veio do motor. Você pode revisar a rota ou repetir a mesma busca.</p>
                <button type="button" onClick={() => runSearch(params)} className="primary-button mt-5"><RotateCcw className="h-4 w-4 text-aqua-200" aria-hidden="true" /> Tentar novamente</button>
              </div>
            )}

            {!idle && !searchError && (
              <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="hidden lg:block">
                  <div className="sticky top-24">
                    {loading || !activeFilters ? <FilterSidebarSkeleton /> : <FilterSidebar flights={activeFlights} filters={activeFilters} priceBounds={priceBounds} onChange={setActiveFilters} />}
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  {loading ? (
                    <>
                      <div role="status" aria-live="polite" className="telemetry-strip telemetry-strip--online flex items-center gap-2 px-4 py-3 text-sm font-semibold text-space-100">
                        <Plane className="h-4 w-4 animate-pulse text-aqua-200" aria-hidden="true" />
                        {apiMode === 'real' ? 'O motor está verificando as fontes. Esta etapa pode levar alguns minutos.' : 'Compondo a demonstração da rota…'}
                      </div>
                      <SortTabsSkeleton />
                      {Array.from({ length: SKELETON_COUNT }, (_, index) => <FlightCardSkeleton key={index} />)}
                    </>
                  ) : (
                    <>
                      {activeFlights.length > 0 && <SortTabs topByKey={topByKey} active={activeSortKey} onChange={setActiveSortKey} />}
                      {sortedFlights.length === 0 ? (
                        <div className="nebula-panel flex flex-col items-center px-6 py-14 text-center">
                          <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-space-100/15 bg-white/[0.035]"><SearchX className="h-6 w-6 text-space-200" aria-hidden="true" /></span>
                          {activeFlights.length === 0 ? (
                            <>
                              <p className="system-kicker mb-2">Sem vetor confirmado</p>
                              <h3 className="font-serif text-2xl font-light text-[#f5ecdd]">Nenhuma tarifa exibível foi encontrada</h3>
                              <p className="mt-2 max-w-lg text-sm leading-6 text-space-100/65">{(journey ? activeLegView?.lastResort?.reason : report?.lastResort?.reason) ?? 'Tente ampliar a flexibilidade ou ajustar a rota para uma nova análise.'}</p>
                              {(journey ? activeLegView?.lastResort : report?.lastResort) && (
                                <a href={(journey ? activeLegView?.lastResort : report?.lastResort)!.bookingUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir busca pronta no Google Flights; abre em nova aba" className="primary-button mt-6">
                                  Abrir busca pronta no Google Flights <ArrowUpRight className="h-4 w-4 text-aqua-200" aria-hidden="true" />
                                </a>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="system-kicker mb-2">Leitura sem correspondência</p>
                              <h3 className="font-serif text-2xl font-light text-[#f5ecdd]">Os filtros ocultaram todas as opções</h3>
                              <p className="mt-2 max-w-md text-sm leading-6 text-space-100/65">Amplie o preço, os horários ou as companhias para reencontrar as tarifas.</p>
                              {activeFilters && <button type="button" onClick={() => setActiveFilters(buildDefaultFilters(activeFlights))} className="primary-button mt-6">Limpar filtros</button>}
                            </>
                          )}
                        </div>
                      ) : (
                        sortedFlights.map((flight) => <FlightCard key={flight.id} flight={flight} isCheapest={flight.id === cheapestId} isFastest={flight.id === fastestId} />)
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {showMobileFilters && activeFilters && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button type="button" aria-label="Fechar filtros" className="absolute inset-0 bg-space-950/80 backdrop-blur-md" onClick={() => { setShowMobileFilters(false); filterButtonRef.current?.focus() }} />
          <div id="mobile-filters" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title" className="thin-scrollbar absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] border-t border-aqua-200/20 bg-space-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-nebula">
            <div className="mb-3 flex items-center justify-between border-b border-space-100/10 px-1 pb-3">
              <div><p className="system-kicker">Console de trajetória</p><h2 id="mobile-filter-title" className="mt-1 font-serif text-xl font-light text-[#f5ecdd]">Refinar resultados{journey ? ` · trecho ${activeLeg + 1}` : ''}</h2></div>
              <button ref={closeFilterRef} type="button" aria-label="Fechar filtros" onClick={() => { setShowMobileFilters(false); filterButtonRef.current?.focus() }} className="flex h-11 w-11 items-center justify-center rounded-full border border-space-100/15 bg-white/[0.04] text-space-100"><X className="h-5 w-5" /></button>
            </div>
            <FilterSidebar flights={activeFlights} filters={activeFilters} priceBounds={priceBounds} onChange={setActiveFilters} />
            <button type="button" onClick={() => { setShowMobileFilters(false); filterButtonRef.current?.focus() }} className="primary-button sticky bottom-0 mt-4 w-full">Ver {filteredFlights.length} opções</button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
