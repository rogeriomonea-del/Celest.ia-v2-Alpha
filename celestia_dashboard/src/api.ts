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
import type { CabinClass, Flight, FlightStop, SearchParams } from './types'

const API_BASE: string = import.meta.env.VITE_API_URL ?? ''
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
  cabin: CabinClass
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
}

export interface EngineOption {
  strategy: string
  label: string
  cabinFinal: CabinClass
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

/** Como a API está operando: real (scraping), mock (demo do motor) ou fora do ar. */
export type ApiMode = 'real' | 'mock' | 'off'

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
  }

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
      throw new Error(`API respondeu ${response.status}`)
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

function airlineOf(carrier: string, label: string) {
  if (carrier === '*') {
    return {
      code: '*',
      name: SOURCE_LABELS[label] ?? 'Metasearch',
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
  const offers = response.flights.filter((flight) => flight.priceBrl !== null)
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
      airline: airlineOf(flight.carrier, flight.airlineLabel),
      flightNumber: flight.indicative
        ? 'Tarifa indicativa do metasearch'
        : flight.flightNumbers.join(' · '),
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
      seatsLeft: flight.seatsLeft !== null && flight.seatsLeft <= 5 ? flight.seatsLeft : null,
      tags: [],
      baggage: { carryOn: true, checkedBags: flight.cabin === 'economy' ? 1 : 2 },
      emissions: 'average',
      bookingUrl: flight.bookingUrl || null,
    }
  })
}
