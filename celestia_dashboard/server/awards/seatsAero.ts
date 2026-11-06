/** seats.aero Partner API client (Cached Search). Server-only; the API key is never logged or returned. */
import type { AwardFare, CabinClass } from '../../src/types.js'
import type { AwardLookup } from './index.js'

export const SEATS_AERO_BASE_URL = 'https://seats.aero/partnerapi/'
/** Partner API quota is 1,000 calls/day per key, so each search makes one call and results are cached. */
export const AWARD_CACHE_TTL_MS = 10 * 60_000
export const AWARD_CACHE_MAX_ENTRIES = 200
/** Round trips up to this many days apart are fetched in a single call covering both directions. */
export const SINGLE_CALL_MAX_DAYS = 30
/** Per-direction candidates kept when pairing outbound and return awards. */
const MAX_PAIRED_PER_DIRECTION = 50
const TAKE = '100'

export interface SeatsAeroOptions {
  /** Sent as the Partner-Authorization header. */
  apiKey: string
  signal: AbortSignal
}

/** Failure talking to seats.aero. The message never contains the API key. */
export class SeatsAeroError extends Error {
  readonly status: number | null
  readonly bodySnippet: string

  constructor(message: string, status: number | null = null, bodySnippet = '') {
    super(message)
    this.name = 'SeatsAeroError'
    this.status = status
    this.bodySnippet = bodySnippet
  }
}

// --- Minimal response shapes (only what we read) ---

interface SeatsAeroTrip {
  Cabin: string
  MileageCost: number
  TotalTaxes: number
  TaxesCurrency: string
  RemainingSeats: number
  Stops: number
  FlightNumbers: string
  UpdatedAt?: string
}

type CabinLetter = 'Y' | 'W' | 'J' | 'F'

/** Availability-level fields per cabin letter: XAvailable, XMileageCost (string), XRemainingSeats, XDirect. */
type CabinFields = { [K in `${CabinLetter}Available` | `${CabinLetter}Direct`]?: boolean } & {
  [K in `${CabinLetter}MileageCost`]?: string
} & { [K in `${CabinLetter}RemainingSeats`]?: number }

export type SeatsAeroAvailability = CabinFields & {
  Route: { OriginAirport: string; DestinationAirport: string }
  Date: string
  UpdatedAt?: string
  AvailabilityTrips?: SeatsAeroTrip[] | null
}

interface SeatsAeroSearchResponse {
  data?: SeatsAeroAvailability[]
}

const CABIN_LETTER: Record<CabinClass, CabinLetter> = { economy: 'Y', premium: 'W', business: 'J' }

// --- Cache ---

interface CacheEntry {
  expiresAt: number
  awards: AwardFare[]
}

const cache = new Map<string, CacheEntry>()

export function clearAwardCache(): void {
  cache.clear()
}

function cacheKey(lookup: AwardLookup): string {
  const date = lookup.returnDate ? `${lookup.date}>${lookup.returnDate}` : lookup.date
  return [lookup.origin, lookup.destination, date, lookup.program.code, lookup.cabin].join('|')
}

function cached(key: string): AwardFare[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.awards
}

function remember(key: string, awards: AwardFare[]): void {
  cache.delete(key)
  while (cache.size >= AWARD_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  cache.set(key, { expiresAt: Date.now() + AWARD_CACHE_TTL_MS, awards })
}

// --- Request ---

interface SearchParams {
  origins: string[]
  destinations: string[]
  startDate: string
  endDate: string
}

async function cachedSearch(lookup: AwardLookup, params: SearchParams, options: SeatsAeroOptions): Promise<SeatsAeroAvailability[]> {
  const url = new URL('search', SEATS_AERO_BASE_URL)
  const query: Record<string, string> = {
    origin_airport: params.origins.join(','),
    destination_airport: params.destinations.join(','),
    start_date: params.startDate,
    end_date: params.endDate,
    sources: lookup.program.awardSource ?? '',
    cabins: lookup.cabin,
    include_trips: 'true',
    minify_trips: 'true',
    take: TAKE,
    order_by: 'lowest_mileage',
  }
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Partner-Authorization': options.apiKey, Accept: 'application/json' },
    signal: options.signal,
  })
  const text = await response.text()
  if (!response.ok) {
    const snippet = text.slice(0, 200).split(options.apiKey).join('[redacted]')
    const reason =
      response.status === 401 || response.status === 403
        ? 'chave inválida'
        : response.status === 429
          ? 'limite de consultas atingido'
          : 'erro do provedor'
    throw new SeatsAeroError(`seats.aero /search -> ${response.status}: ${reason}`, response.status, snippet)
  }
  let payload: SeatsAeroSearchResponse
  try {
    payload = JSON.parse(text) as SeatsAeroSearchResponse
  } catch {
    throw new SeatsAeroError('seats.aero /search: resposta não é JSON', response.status)
  }
  if (!Array.isArray(payload?.data)) throw new SeatsAeroError('seats.aero /search: resposta sem data', response.status)
  return payload.data
}

// --- Mapping ---

/** "CM326, TK800" -> ["CM 326", "TK 800"]; entries in another shape are kept as-is. */
export function splitFlightNumbers(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/, '$1 $2'))
}

interface Direction {
  origin: string
  destination: string
  date: string
}

function faresFor(rows: SeatsAeroAvailability[], direction: Direction, lookup: AwardLookup): AwardFare[] {
  const base = {
    program: lookup.program.code,
    programName: lookup.program.name,
    cabin: lookup.cabin,
    matchesItinerary: false,
    source: 'seats_aero' as const,
    bookingUrl: null,
  }
  const letter = CABIN_LETTER[lookup.cabin]
  const fares: AwardFare[] = []
  for (const row of rows) {
    if (
      row.Route?.OriginAirport !== direction.origin ||
      row.Route?.DestinationAirport !== direction.destination ||
      row.Date !== direction.date
    ) {
      continue
    }
    const fetchedAt = row.UpdatedAt || new Date().toISOString()
    const trips = (row.AvailabilityTrips ?? []).filter((trip) => trip.Cabin === lookup.cabin && trip.MileageCost > 0)
    if (row.AvailabilityTrips && row.AvailabilityTrips.length > 0) {
      for (const trip of trips) {
        fares.push({
          ...base,
          miles: trip.MileageCost,
          taxes: trip.TaxesCurrency ? { amount: Math.round(trip.TotalTaxes) / 100, currency: trip.TaxesCurrency } : null,
          seatsLeft: trip.RemainingSeats > 0 ? trip.RemainingSeats : null,
          direct: trip.Stops === 0,
          flightNumbers: trip.FlightNumbers ? splitFlightNumbers(trip.FlightNumbers) : null,
          fetchedAt,
        })
      }
      continue
    }
    const miles = Number(row[`${letter}MileageCost`])
    if (row[`${letter}Available`] === true && miles > 0) {
      const seats = Number(row[`${letter}RemainingSeats`])
      fares.push({
        ...base,
        miles,
        taxes: null,
        seatsLeft: seats > 0 ? seats : null,
        direct: row[`${letter}Direct`] === true,
        flightNumbers: null,
        fetchedAt,
      })
    }
  }
  return fares
}

/** Outbound + return as one round-trip award. */
export function combineAwards(out: AwardFare, ret: AwardFare): AwardFare {
  const taxes =
    out.taxes && ret.taxes && out.taxes.currency === ret.taxes.currency
      ? { amount: Math.round((out.taxes.amount + ret.taxes.amount) * 100) / 100, currency: out.taxes.currency }
      : null
  return {
    ...out,
    miles: out.miles + ret.miles,
    taxes,
    seatsLeft: out.seatsLeft !== null && ret.seatsLeft !== null ? Math.min(out.seatsLeft, ret.seatsLeft) : null,
    direct: out.direct && ret.direct,
    flightNumbers: out.flightNumbers && ret.flightNumbers ? [...out.flightNumbers, ...ret.flightNumbers] : null,
    fetchedAt: out.fetchedAt < ret.fetchedAt ? out.fetchedAt : ret.fetchedAt,
  }
}

const cheapestFirst = (fares: AwardFare[]) => [...fares].sort((a, b) => a.miles - b.miles).slice(0, MAX_PAIRED_PER_DIRECTION)

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

async function fetchAwards(lookup: AwardLookup, options: SeatsAeroOptions): Promise<AwardFare[]> {
  const outbound: Direction = { origin: lookup.origin, destination: lookup.destination, date: lookup.date }
  if (!lookup.returnDate) {
    const rows = await cachedSearch(
      lookup,
      { origins: [lookup.origin], destinations: [lookup.destination], startDate: lookup.date, endDate: lookup.date },
      options,
    )
    return faresFor(rows, outbound, lookup)
  }

  const inbound: Direction = { origin: lookup.destination, destination: lookup.origin, date: lookup.returnDate }
  let outRows: SeatsAeroAvailability[]
  let retRows: SeatsAeroAvailability[]
  if (daysBetween(lookup.date, lookup.returnDate) <= SINGLE_CALL_MAX_DAYS) {
    outRows = retRows = await cachedSearch(
      lookup,
      {
        origins: [lookup.origin, lookup.destination],
        destinations: [lookup.destination, lookup.origin],
        startDate: lookup.date,
        endDate: lookup.returnDate,
      },
      options,
    )
  } else {
    const single = (d: Direction) =>
      cachedSearch(lookup, { origins: [d.origin], destinations: [d.destination], startDate: d.date, endDate: d.date }, options)
    ;[outRows, retRows] = await Promise.all([single(outbound), single(inbound)])
  }
  const outs = cheapestFirst(faresFor(outRows, outbound, lookup))
  const rets = cheapestFirst(faresFor(retRows, inbound, lookup))
  return outs.flatMap((out) => rets.map((ret) => combineAwards(out, ret)))
}

/**
 * Award fares in the lookup's cabin for its route and date(s). For a round trip each
 * fare pairs an outbound and a return award (the Duffel offer prices both slices).
 */
export async function searchAwards(lookup: AwardLookup, options: SeatsAeroOptions): Promise<AwardFare[]> {
  const key = cacheKey(lookup)
  const hit = cached(key)
  if (hit) return hit
  const awards = await fetchAwards(lookup, options)
  remember(key, awards)
  return awards
}
