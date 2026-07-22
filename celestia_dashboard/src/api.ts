/**
 * Cliente da API do motor celest.ia (a "ponte").
 *
 * O site chama `POST /api/search`, que roda o Orchestrator real (pré-filtro,
 * scraping multi-agente, matemática de milhas) e devolve voos + estratégias.
 * Em dev/preview o Vite faz proxy de /api para http://127.0.0.1:8000
 * (`python -m celestia_engine serve`); em produção defina VITE_API_URL ou
 * proxie /api no seu servidor.
 */

import { AIRLINES } from './data/flights'
import { AIRPORTS } from './data/airports'
import type {
  ApiMode,
  CabinClass,
  Flight,
  FlightStop,
  JourneyResult,
  LegView,
  PurchaseStrategy,
  SearchLeg,
  SearchParams,
  SearchResult,
} from './types'

const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
// Deve ser MAIOR que o teto do motor (API_SEARCH_TIMEOUT_S, padrão 300s) e que
// o proxy_read_timeout do nginx — senão o site desiste antes do motor terminar.
const SEARCH_TIMEOUT_MS = 310_000

// ------------------------------------------------------------ resposta da API
export interface EngineFlight {
  id: string
  carrier: string
  airlineLabel: string
  flightNumbers: string[]
  origin: string
  destination: string
  depart: string
  cabin: 'economy' | 'premium' | 'business'
  priceBrl: number | null
  taxesBrl: number
  priceMiles: number | null
  milesProgram: string | null
  seatsLeft: number | null
  source: string
  strategy: string | null
  fareBrand: string | null
  aircraft: string | null
  stops: { airport: string; layoverMin: number }[]
  departureTime: string
  arrivalTime: string
  arrivalDayOffset: number
  durationMin: number
  scheduleEstimated: boolean
  /** true = cotação do pré-filtro (metasearch), não um itinerário reservável. */
  indicative: boolean
  /** Link de reserva: capturado pelo scraper, deep-link da cia ou Google Flights. */
  bookingUrl: string
  /** Milhas equivalentes ao preço em dinheiro, no milheiro do programa do usuário. */
  milesEquivalent: number | null
}

export interface EngineOption {
  strategy: string
  label: string
  cabinFinal: 'economy' | 'premium' | 'business'
  cashBrl: number
  miles: number
  milheiroBrl: number | null
  effectiveTotalBrl: number
  breakevenMilheiroBrl: number | null
  offerKey: string
  notes: string[]
}

export interface EngineStats {
  candidatesTotal: number
  candidatesScraped: number
  scrapesSavedByPrefilter: number
  subagentsSpawned: number
  durationSeconds: number
}

export interface EngineSearchResponse {
  mode: 'mock' | 'real'
  flights: EngineFlight[]
  options: EngineOption[]
  quotes: { route: string; depart: string; priceBrl: number; source: string }[]
  stats: EngineStats
  agentLog: string[]
  /** Garantia nunca-vazio: quando NENHUMA fonte respondeu com preço, a API
   * devolve o link da busca já montada no Google Flights. */
  lastResort: { bookingUrl: string; reason: string } | null
}

interface EngineSearchRequest {
  origin: string
  destination: string
  depart: string
  returnDate: string | null
  cabin: 'economy' | 'premium' | 'business'
  passengers: number
  flexibility: {
    enabled: true
    preset: string
    windowStart: string | null
    windowEnd: string | null
  } | null
}

/** Sonda rápida do /api/status no carregamento da página. Nunca lança. */
export async function fetchApiMode(): Promise<ApiMode> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`${API_BASE}/api/status`, { signal: controller.signal })
    if (!response.ok) return 'off'
    const status = (await response.json()) as { mockMode?: boolean }
    return status.mockMode ? 'mock' : 'real'
  } catch {
    return 'off'
  } finally {
    clearTimeout(timer)
  }
}

// ------------------------------------------------------------------- request
/** Data local → YYYY-MM-DD sem sofrer com fuso (toISOString desloca o dia). */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export async function searchFlights(params: SearchParams): Promise<EngineSearchResponse> {
  if (!params.departDate) throw new Error('data de ida ausente')
  const flex = params.flexibility
  const body = {
    origin: params.origin.code,
    destination: params.destination.code,
    depart: isoDate(params.departDate),
    returnDate: params.returnDate ? isoDate(params.returnDate) : null,
    cabin: params.cabin,
    passengers: params.passengers.adults + params.passengers.children,
    flexibility: flex.enabled
      ? {
          enabled: true,
          preset: flex.preset,
          windowStart: flex.windowStart ? isoDate(flex.windowStart) : null,
          windowEnd: flex.windowEnd ? isoDate(flex.windowEnd) : null,
        }
      : null,
  } satisfies EngineSearchRequest

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      // o motor manda o diagnóstico real no detail (ex.: "busca excedeu
      // 300s — aumente API_SEARCH_TIMEOUT_S"); um 502/504 do proxy vem em
      // HTML e cai no catch
      let detail = ''
      try {
        const rawDetail = ((await response.json()) as { detail?: unknown })?.detail
        detail =
          typeof rawDetail === 'string'
            ? rawDetail
            : rawDetail == null
              ? ''
              : JSON.stringify(rawDetail)
      } catch {
        detail = ''
      }
      throw new Error(detail || `API respondeu ${response.status}`)
    }
    return (await response.json()) as EngineSearchResponse
  } finally {
    clearTimeout(timer)
  }
}

// -------------------------------------------------------------------- mapper
function cityOf(code: string): string {
  return AIRPORTS.find((airport) => airport.code === code)?.city ?? code
}

const SOURCE_LABELS: Record<string, string> = {
  google_flights: 'Google Flights',
  google_flights2: 'Google Flights',
  skyscanner: 'Skyscanner',
  mock: 'Demo',
}

function airlineOf(carrier: string, label: string, source: string) {
  if (carrier === '*') {
    return {
      code: '*',
      name: SOURCE_LABELS[source] ?? (label || 'Metasearch'),
      logoGradient: 'from-indigo-400 to-violet-600',
    }
  }
  return (
    AIRLINES[carrier] ?? {
      code: carrier,
      name: label || carrier,
      logoGradient: 'from-slate-500 to-slate-700',
    }
  )
}

/** Converte as ofertas do motor para o formato dos cards do site. */
export function mapEngineFlights(response: EngineSearchResponse, cabin: CabinClass): Flight[] {
  const offers = response.flights.filter(
    (flight) =>
      flight.priceBrl !== null && Number.isFinite(flight.priceBrl) && flight.priceBrl > 0,
  )
  const ofCabin = offers.filter((flight) => flight.cabin === cabin)
  const chosen = ofCabin.length > 0 ? ofCabin : offers

  return chosen.map((flight) => {
    const stops: FlightStop[] = flight.stops.map((stop) => ({
      airportCode: stop.airport,
      city: cityOf(stop.airport),
      layoverMin: stop.layoverMin,
    }))
    return {
      id: flight.id,
      airline: airlineOf(flight.carrier, flight.airlineLabel, flight.source),
      flightNumber: flight.flightNumbers.join(' · ') || 'Itinerário não detalhado',
      cabin: flight.cabin,
      travelDate: flight.depart,
      departure: { time: flight.departureTime, airportCode: flight.origin },
      arrival: {
        time: flight.arrivalTime,
        airportCode: flight.destination,
        dayOffset: flight.arrivalDayOffset,
      },
      durationMin: flight.durationMin,
      stops,
      price: Math.round(flight.priceBrl as number),
      currency: 'BRL',
      taxesBrl: flight.taxesBrl,
      priceMiles: flight.priceMiles,
      milesProgram: flight.milesProgram,
      seatsLeft:
        flight.seatsLeft !== null && flight.seatsLeft > 0 && flight.seatsLeft <= 5
          ? flight.seatsLeft
          : null,
      tags: [],
      baggage: null,
      emissions: null,
      strategy: flight.strategy,
      fareBrand: flight.fareBrand,
      aircraft: flight.aircraft,
      scheduleEstimated: flight.scheduleEstimated,
      indicative: flight.indicative,
      sourceCode: flight.source,
      sourceLabel: SOURCE_LABELS[flight.source] ?? flight.source,
      bookingUrl: flight.bookingUrl || null,
      milesEquivalent: flight.milesEquivalent,
    }
  })
}

function mapEngineOptions(options: EngineOption[]): PurchaseStrategy[] {
  return options.map((option) => ({
    id: `${option.strategy}:${option.offerKey}`,
    strategy: option.strategy,
    label: option.label,
    cabinFinal: option.cabinFinal,
    cashBrl: option.cashBrl,
    miles: option.miles,
    milheiroBrl: option.milheiroBrl,
    effectiveTotalBrl: option.effectiveTotalBrl,
    breakevenMilheiroBrl: option.breakevenMilheiroBrl,
    notes: [...option.notes],
  }))
}

/** Mapeia o contrato bruto para modelos de apresentação antes de chegar à UI. */
export function mapEngineSearchResponse(
  response: EngineSearchResponse,
  cabin: CabinClass,
): SearchResult {
  return {
    mode: response.mode,
    flights: mapEngineFlights(response, cabin),
    strategies: mapEngineOptions(response.options),
    quotes: response.quotes.map((quote) => ({ ...quote })),
    stats: { ...response.stats },
    agentLog: [...response.agentLog],
    lastResort: response.lastResort ? { ...response.lastResort } : null,
    offersReceived: response.flights.length,
    indicativeOffers: response.flights.filter((flight) => flight.indicative).length,
  }
}

/** Entrada usada pela interface: busca e devolve somente tipos já mapeados. */
export async function searchTravel(params: SearchParams): Promise<SearchResult> {
  const response = await searchFlights(params)
  return mapEngineSearchResponse(response, params.cabin)
}

// ===================================================== multidestinos (contrato)
export interface EngineFlexibility {
  enabled: true
  preset: '1w' | '2w' | '3w' | '1m' | 'custom'
  windowStart: string | null
  windowEnd: string | null
}

export interface EngineMultiCityLegRequest {
  origin: string
  destination: string
  depart: string
  flexibility: EngineFlexibility | null
}

export interface EngineMultiCitySearchRequest {
  legs: EngineMultiCityLegRequest[]
  cabin: 'economy' | 'premium' | 'business'
  passengers: number
  milesBalance?: number
  program?: string
  flexMaxDates?: number
}

export interface EngineMultiCityLegResult extends EngineSearchResponse {
  legIndex: number
  origin: string
  destination: string
  requestedDepart: string
  status: 'ok' | 'empty' | 'failed' | 'timeout'
  error: {
    code: string
    message: string
    retriable: boolean
  } | null
}

export interface EngineMultiCitySelection {
  legIndex: number
  flightId: string
  optionKey: string | null
  strategy: string
  bookingUrl: string
}

export interface EngineMultiCityItinerary {
  id: string
  rank: number
  priceBasis: 'perPassenger'
  selections: EngineMultiCitySelection[]
  cashBrl: number
  miles: number
  effectiveTotalBrl: number
  milesShortfall: number
  notes: string[]
}

export interface EngineMultiCityStats extends EngineStats {
  legsTotal: number
  legsSucceeded: number
  legsEmpty: number
  legsFailed: number
}

export interface EngineMultiCitySearchResponse {
  mode: 'mock' | 'real'
  searchType: 'multiCity'
  pricingScope: 'independentLegs'
  partial: boolean
  legs: EngineMultiCityLegResult[]
  itineraries: EngineMultiCityItinerary[]
  stats: EngineMultiCityStats
  agentLog: string[]
}

// deve ser MAIOR que MULTICITY_SEARCH_TIMEOUT_S (600s) do motor
const MULTICITY_TIMEOUT_MS = 620_000

/** Raio (dias) dos presets — espelha FLEX_PRESETS do motor. */
const FLEX_PRESET_RADIUS: Record<'1w' | '2w' | '3w' | '1m', number> = {
  '1w': 7,
  '2w': 14,
  '3w': 21,
  '1m': 30,
}

function addDaysIso(date: Date, days: number): string {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return isoDate(copy)
}

/**
 * Flexibilidade do 1º trecho numa jornada: convertida para janela `custom`
 * explícita e RECORTADA para nunca ultrapassar a data do trecho seguinte —
 * as datas da jornada permanecem cronologicamente válidas.
 */
function legFlexibility(
  params: SearchParams,
  firstDepart: Date,
  nextDepart: Date | null,
): EngineFlexibility | null {
  const flex = params.flexibility
  if (!flex.enabled) return null
  let start: string
  let end: string
  if (flex.preset === 'custom') {
    if (!flex.windowStart || !flex.windowEnd) return null
    start = isoDate(flex.windowStart)
    end = isoDate(flex.windowEnd)
  } else {
    const radius = FLEX_PRESET_RADIUS[flex.preset]
    start = addDaysIso(firstDepart, -radius)
    end = addDaysIso(firstDepart, radius)
  }
  if (nextDepart) {
    const limit = addDaysIso(nextDepart, -1)
    if (end > limit) end = limit
  }
  if (start > end) return null
  return { enabled: true, preset: 'custom', windowStart: start, windowEnd: end }
}

interface MultiCityErrorDetail {
  code?: unknown
  message?: unknown
}

function detailMessage(raw: unknown, status: number): string {
  if (typeof raw === 'string' && raw) return raw
  if (raw && typeof raw === 'object') {
    const detail = raw as MultiCityErrorDetail
    const code = typeof detail.code === 'string' ? detail.code : ''
    const message = typeof detail.message === 'string' ? detail.message : ''
    if (code || message) return [code, message].filter(Boolean).join(': ')
    return JSON.stringify(raw)
  }
  return `API respondeu ${status}`
}

/** Busca uma jornada de 2..6 trechos no novo endpoint do motor. */
export async function searchMultiCityRaw(
  request: EngineMultiCitySearchRequest,
): Promise<EngineMultiCitySearchResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MULTICITY_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}/api/search/multi-city`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (response.status === 404) {
      throw new Error(
        'O motor conectado ainda não suporta multidestinos — atualize o motor (celestia_engine) para a versão com POST /api/search/multi-city.',
      )
    }
    if (!response.ok) {
      let raw: unknown = null
      try {
        raw = ((await response.json()) as { detail?: unknown })?.detail ?? null
      } catch {
        raw = null
      }
      throw new Error(detailMessage(raw, response.status))
    }
    return (await response.json()) as EngineMultiCitySearchResponse
  } finally {
    clearTimeout(timer)
  }
}

function mapLegResult(leg: EngineMultiCityLegResult, cabin: CabinClass): LegView {
  const base = mapEngineSearchResponse(leg, cabin)
  return {
    ...base,
    legIndex: leg.legIndex,
    origin: leg.origin,
    destination: leg.destination,
    requestedDepart: leg.requestedDepart,
    status: leg.status,
    error: leg.error ? { ...leg.error } : null,
  }
}

export function mapMultiCityResponse(
  response: EngineMultiCitySearchResponse,
  cabin: CabinClass,
): JourneyResult {
  return {
    mode: response.mode,
    searchType: response.searchType,
    pricingScope: response.pricingScope,
    partial: response.partial,
    legs: response.legs.map((leg) => mapLegResult(leg, cabin)),
    itineraries: response.itineraries.map((itinerary) => ({
      ...itinerary,
      selections: itinerary.selections.map((selection) => ({ ...selection })),
      notes: [...itinerary.notes],
    })),
    stats: { ...response.stats },
    agentLog: [...response.agentLog],
  }
}

/**
 * Entrada usada pela interface para jornadas (multidestinos E ida-e-volta,
 * que internamente é uma jornada de 2 trechos). Devolve tipos já mapeados.
 */
export async function searchJourney(
  params: SearchParams,
  legs: SearchLeg[],
): Promise<JourneyResult> {
  const prepared = legs.map((leg, index) => {
    if (!leg.departDate) throw new Error(`trecho ${index + 1}: data ausente`)
    const nextDepart = index === 0 ? (legs[1]?.departDate ?? null) : null
    return {
      origin: leg.origin.code,
      destination: leg.destination.code,
      depart: isoDate(leg.departDate),
      flexibility:
        index === 0 ? legFlexibility(params, leg.departDate, nextDepart) : null,
    }
  })
  const request: EngineMultiCitySearchRequest = {
    legs: prepared,
    cabin: params.cabin,
    passengers: Math.max(1, params.passengers.adults + params.passengers.children),
  }
  const response = await searchMultiCityRaw(request)
  return mapMultiCityResponse(response, params.cabin)
}
