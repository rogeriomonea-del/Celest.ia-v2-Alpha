/**
 * Minimal Duffel API v2 client (plain fetch). Server-only: reads
 * DUFFEL_ACCESS_TOKEN at request time and never logs or returns it.
 */
import type { SearchRequest } from '../src/shared/api.js'

export const DUFFEL_BASE_URL = 'https://api.duffel.com'
export const DUFFEL_VERSION = 'v2'

/** Per-airline wait inside Duffel (ms). Kept below our own HTTP timeout so Duffel answers with what it has. */
export const SUPPLIER_TIMEOUT_MS = 18_000
/** Whole search call, including Duffel overhead; keeps the function under 25 s. */
export const SEARCH_TIMEOUT_MS = 22_000
export const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Our UI does not ask children's ages. Duffel v2 wants an `age` for anyone
 * under 18 (only adults take a `type`), so we send a representative age:
 * 8 for a child (2–11 fare band) and 1 for a lap infant (under 2, no seat).
 */
export const GENERIC_CHILD_AGE = 8
export const GENERIC_INFANT_AGE = 1

// --- Minimal response shapes (only what we read) ---

export interface DuffelAirline {
  id?: string
  name: string
  iata_code: string | null
  logo_symbol_url: string | null
}

export interface DuffelCity {
  type?: 'city'
  name: string
  iata_code: string | null
  iata_country_code: string
  airports?: DuffelAirport[] | null
}

export interface DuffelAirport {
  type?: 'airport'
  name: string
  iata_code: string | null
  iata_country_code: string
  city_name: string | null
  city?: DuffelCity | null
}

export interface DuffelBaggage {
  type: 'carry_on' | 'checked'
  quantity: number
}

export interface DuffelSegment {
  departing_at: string
  arriving_at: string
  duration: string | null
  origin: DuffelAirport
  destination: DuffelAirport
  marketing_carrier: DuffelAirline
  marketing_carrier_flight_number: string
  aircraft: { name: string } | null
  passengers: { passenger_id: string; baggages: DuffelBaggage[] }[]
}

export interface DuffelSlice {
  duration: string | null
  segments: DuffelSegment[]
}

export interface DuffelCondition {
  allowed: boolean
}

export interface DuffelOffer {
  id: string
  owner: DuffelAirline
  slices: DuffelSlice[]
  passengers: { id: string; type: string | null; age?: number | null }[]
  total_amount: string
  total_currency: string
  total_emissions_kg: string | null
  expires_at: string
  conditions: {
    refund_before_departure: DuffelCondition | null
    change_before_departure: DuffelCondition | null
  }
}

export interface DuffelOfferRequest {
  id: string
  offers: DuffelOffer[]
}

export interface DuffelPlace {
  type: 'airport' | 'city'
  name: string
  iata_code: string | null
  iata_country_code: string
  city_name: string | null
  city: DuffelCity | null
  airports: DuffelAirport[] | null
}

// --- Errors ---

export type DuffelErrorKind = 'not_configured' | 'network' | 'timeout' | 'response'

/** Failure talking to Duffel. `message` is internal (English) and must not reach users. */
export class DuffelError extends Error {
  readonly kind: DuffelErrorKind
  /** HTTP status from Duffel (kind 'response' only). */
  readonly status: number | null
  /** Duffel `errors[0].code`, e.g. "validation_error", "offer_no_longer_available". */
  readonly code: string | null
  /** Duffel `errors[0].type`, e.g. "validation_error", "airline_error". */
  readonly type: string | null

  constructor(init: {
    kind: DuffelErrorKind
    message: string
    status?: number | null
    code?: string | null
    type?: string | null
  }) {
    super(init.message)
    this.name = 'DuffelError'
    this.kind = init.kind
    this.status = init.status ?? null
    this.code = init.code ?? null
    this.type = init.type ?? null
  }
}

interface DuffelErrorBody {
  errors?: { code?: string; type?: string; message?: string; title?: string }[]
}

// --- Request helper ---

interface RequestOptions {
  query?: Record<string, string>
  body?: unknown
  timeoutMs?: number
}

async function duffelRequest<T>(method: 'GET' | 'POST', path: string, options: RequestOptions = {}): Promise<T> {
  const token = process.env.DUFFEL_ACCESS_TOKEN?.trim()
  if (!token) {
    throw new DuffelError({ kind: 'not_configured', message: 'DUFFEL_ACCESS_TOKEN is not set' })
  }

  const url = new URL(path, DUFFEL_BASE_URL)
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let response: Response
  let payload: unknown = null
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Duffel-Version': DUFFEL_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify({ data: options.body }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }
  } catch (err) {
    const timedOut = controller.signal.aborted
    throw new DuffelError({
      kind: timedOut ? 'timeout' : 'network',
      message: timedOut ? `Duffel ${method} ${url.pathname} timed out` : `Duffel ${method} ${url.pathname} failed: ${errorName(err)}`,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const first = (payload as DuffelErrorBody | null)?.errors?.[0]
    throw new DuffelError({
      kind: 'response',
      status: response.status,
      code: first?.code ?? null,
      type: first?.type ?? null,
      message: `Duffel ${method} ${url.pathname} -> ${response.status}${first?.message ? `: ${first.message}` : ''}`,
    })
  }

  const data = (payload as { data?: T } | null)?.data
  if (data === undefined) {
    throw new DuffelError({ kind: 'response', status: response.status, message: `Duffel ${url.pathname}: missing data` })
  }
  return data
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown'
}

// --- Endpoints ---

const CABIN_CLASS: Record<SearchRequest['cabin'], 'economy' | 'premium_economy' | 'business'> = {
  economy: 'economy',
  premium: 'premium_economy',
  business: 'business',
}

type DuffelPassengerInput = { type: 'adult' } | { age: number }

export function buildOfferRequestBody(req: SearchRequest) {
  const slices = [{ origin: req.origin, destination: req.destination, departure_date: req.departDate }]
  if (req.returnDate) {
    slices.push({ origin: req.destination, destination: req.origin, departure_date: req.returnDate })
  }
  const passengers: DuffelPassengerInput[] = [
    ...Array.from({ length: req.passengers.adults }, () => ({ type: 'adult' as const })),
    ...Array.from({ length: req.passengers.children }, () => ({ age: GENERIC_CHILD_AGE })),
    ...Array.from({ length: req.passengers.infants }, () => ({ age: GENERIC_INFANT_AGE })),
  ]
  return { slices, passengers, cabin_class: CABIN_CLASS[req.cabin], max_connections: 2 }
}

/** POST /air/offer_requests?return_offers=true — returns the offers found. */
export async function createOfferRequest(req: SearchRequest): Promise<DuffelOffer[]> {
  const result = await duffelRequest<DuffelOfferRequest>('POST', '/air/offer_requests', {
    query: { return_offers: 'true', supplier_timeout: String(SUPPLIER_TIMEOUT_MS) },
    body: buildOfferRequestBody(req),
    timeoutMs: SEARCH_TIMEOUT_MS,
  })
  return result.offers ?? []
}

/** GET /air/offers/{id} — current price and conditions of one offer. */
export function getOffer(id: string): Promise<DuffelOffer> {
  return duffelRequest<DuffelOffer>('GET', `/air/offers/${encodeURIComponent(id)}`)
}

/** GET /places/suggestions?name= — airports and cities matching the text. */
export function placeSuggestions(query: string): Promise<DuffelPlace[]> {
  return duffelRequest<DuffelPlace[]>('GET', '/places/suggestions', { query: { name: query } })
}
