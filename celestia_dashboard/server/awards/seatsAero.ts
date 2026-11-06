/** seats.aero Partner API client (Cached Search). Server-only; the API key is never logged or returned. */
import type { AwardFare, CabinClass } from '../../src/types.js'
import type { AwardLookup } from './index.js'

export const SEATS_AERO_BASE_URL = 'https://seats.aero/partnerapi/'
/** Partner API quota is 1,000 calls/day per key, so each search makes one call and results are cached. */
export const AWARD_CACHE_TTL_MS = 10 * 60_000
/** Cached directions (origin, destination, date, program, cabin). */
export const AWARD_CACHE_MAX_ENTRIES = 200
/** Round trips up to this many days apart are fetched in a single call covering both directions. */
export const SINGLE_CALL_MAX_DAYS = 30
/** Cheapest awards kept per direction, in the cache and when pairing outbound and return awards. */
export const MAX_AWARDS_PER_DIRECTION = 50
/** Round-trip pairs returned per lookup, cheapest first. */
export const MAX_ROUND_TRIP_PAIRS = 400
/** After a 401/403 the key is not retried for this long. */
export const AUTH_FAILURE_BLOCK_MS = 60 * 60_000
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

interface Direction {
  origin: string
  destination: string
  date: string
}

interface CacheEntry {
  expiresAt: number
  /** At most MAX_AWARDS_PER_DIRECTION, cheapest first. */
  awards: AwardFare[]
}

/** Per-direction award lists; round trips are paired on read. */
const cache = new Map<string, CacheEntry>()
/** Fetches in flight per direction, so concurrent lookups share one call. */
const pending = new Map<string, Promise<AwardFare[]>>()

/** Set after a quota (429) or credential (401/403) failure: no call is made until it expires. */
let blocked: { until: number; status: number } | null = null

export function clearAwardCache(): void {
  cache.clear()
  pending.clear()
  blocked = null
}

function directionKey(lookup: AwardLookup, direction: Direction): string {
  return [direction.origin, direction.destination, direction.date, lookup.program.code, lookup.cabin].join('|')
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

// --- Negative cache ---

function nextUtcMidnight(now: number): number {
  const today = new Date(now)
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)
}

function block(status: number): void {
  const now = Date.now()
  if (status === 429) blocked = { until: nextUtcMidnight(now), status }
  else if (status === 401 || status === 403) blocked = { until: now + AUTH_FAILURE_BLOCK_MS, status }
}

/** Throws the remembered failure while a block is active, without calling seats.aero. */
function throwIfBlocked(): void {
  if (!blocked) return
  if (blocked.until <= Date.now()) {
    blocked = null
    return
  }
  const reason = blocked.status === 429 ? 'limite diário de consultas atingido' : 'chave inválida'
  throw new SeatsAeroError(`seats.aero /search -> ${blocked.status} (em cache): ${reason}`, blocked.status)
}

// --- Request ---

interface SearchParams {
  origins: string[]
  destinations: string[]
  startDate: string
  endDate: string
}

async function cachedSearch(lookup: AwardLookup, params: SearchParams, options: SeatsAeroOptions): Promise<SeatsAeroAvailability[]> {
  throwIfBlocked()
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
    block(response.status)
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

/**
 * Outbound + return as one round-trip award. Taxes in two different currencies cannot be
 * summed, so they stay null (unknown); the calculator then leaves the award unvalued instead
 * of counting the taxes as R$ 0.
 */
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

/** True unless the award is known to have fewer seats left than `passengers`. */
export const hasSeatsFor = (award: AwardFare, passengers: number) => award.seatsLeft === null || award.seatsLeft >= passengers

const cheapestFirst = (fares: AwardFare[]) => [...fares].sort((a, b) => a.miles - b.miles).slice(0, MAX_AWARDS_PER_DIRECTION)

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

/** Caches a direction's awards once fetched; concurrent lookups await the same promise meanwhile. */
function track(key: string, fetching: Promise<AwardFare[]>): Promise<AwardFare[]> {
  const promise: Promise<AwardFare[]> = fetching
    .then((awards) => {
      remember(key, awards)
      return awards
    })
    .finally(() => {
      if (pending.get(key) === promise) pending.delete(key)
    })
  pending.set(key, promise)
  return promise
}

/**
 * Awards per direction, cheapest first, from the cache, a fetch already in flight, or seats.aero.
 * Two uncached directions up to SINGLE_CALL_MAX_DAYS apart share one call; otherwise each
 * direction is fetched and cached on its own, so one failed leg does not waste the other.
 */
function directionAwards(lookup: AwardLookup, directions: Direction[], options: SeatsAeroOptions): Promise<AwardFare[][]> {
  const keys = directions.map((direction) => directionKey(lookup, direction))
  const found: (AwardFare[] | Promise<AwardFare[]> | null)[] = keys.map((key) => cached(key) ?? pending.get(key) ?? null)
  const missing = keys.flatMap((_key, i) => (found[i] === null ? [i] : []))
  const fares = (direction: Direction) => (rows: SeatsAeroAvailability[]) => cheapestFirst(faresFor(rows, direction, lookup))

  if (missing.length === 2 && daysBetween(directions[0].date, directions[1].date) <= SINGLE_CALL_MAX_DAYS) {
    const [out, ret] = directions
    const rows = cachedSearch(
      lookup,
      { origins: [out.origin, ret.origin], destinations: [out.destination, ret.destination], startDate: out.date, endDate: ret.date },
      options,
    )
    for (const i of missing) found[i] = track(keys[i], rows.then(fares(directions[i])))
  } else {
    for (const i of missing) {
      const d = directions[i]
      const rows = cachedSearch(lookup, { origins: [d.origin], destinations: [d.destination], startDate: d.date, endDate: d.date }, options)
      found[i] = track(keys[i], rows.then(fares(d)))
    }
  }
  return Promise.all(found as (AwardFare[] | Promise<AwardFare[]>)[])
}

/** Every outbound x return pair, cheapest first, capped at MAX_ROUND_TRIP_PAIRS. */
function pairAwards(outs: AwardFare[], rets: AwardFare[]): AwardFare[] {
  return outs
    .flatMap((out) => rets.map((ret) => combineAwards(out, ret)))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, MAX_ROUND_TRIP_PAIRS)
}

/**
 * Award fares in the lookup's cabin for its route and date(s), cheapest first. For a round trip
 * each fare pairs an outbound and a return award (the Duffel offer prices both slices).
 */
export async function searchAwards(lookup: AwardLookup, options: SeatsAeroOptions): Promise<AwardFare[]> {
  // Each leg is checked before pairing: a pair's seat count is unknown when either leg's is.
  const seated = (fares: AwardFare[]) => fares.filter((fare) => hasSeatsFor(fare, lookup.passengers))
  const outbound: Direction = { origin: lookup.origin, destination: lookup.destination, date: lookup.date }
  if (!lookup.returnDate) {
    const [outs] = await directionAwards(lookup, [outbound], options)
    return seated(outs)
  }
  const inbound: Direction = { origin: lookup.destination, destination: lookup.origin, date: lookup.returnDate }
  const [outs, rets] = await directionAwards(lookup, [outbound, inbound], options)
  return pairAwards(seated(outs), seated(rets))
}
