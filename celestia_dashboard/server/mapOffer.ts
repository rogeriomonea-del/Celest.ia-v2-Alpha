/** Duffel offer -> Flight (src/types.ts). Pure functions, no I/O. */
import type { Airline, Flight, FlightSegment, FlightSlice, FlightStop, FlightTag, Money } from '../src/types.js'
import type { DuffelAirline, DuffelAirport, DuffelCondition, DuffelOffer, DuffelSegment, DuffelSlice } from './duffel.js'

/** Fallback logo gradients (Tailwind classes; tailwind.config scans server/). */
export const LOGO_GRADIENTS = [
  'from-rose-600 to-red-800',
  'from-sky-500 to-blue-700',
  'from-orange-500 to-amber-600',
  'from-emerald-500 to-green-700',
  'from-indigo-600 to-blue-900',
  'from-amber-400 to-yellow-600',
  'from-cyan-500 to-sky-700',
  'from-violet-500 to-purple-700',
  'from-fuchsia-500 to-pink-700',
  'from-teal-500 to-emerald-700',
] as const

const DURATION_RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

/** ISO-8601 duration ("PT10H35M", "P1DT2H") -> whole minutes; null if absent or unparseable. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null
  const match = DURATION_RE.exec(value)
  if (!match || value === 'P' || value.endsWith('T')) return null
  const [, d, h, m, s] = match
  return Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(m ?? 0) + Math.round(Number(s ?? 0) / 60)
}

/** Minutes between two local ISO date-times without offset (same clock). */
function localDiffMin(from: string, to: string): number {
  return Math.round((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 60_000)
}

function localDayDiff(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000)
}

function hashCode(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash
}

export function gradientFor(code: string): string {
  return LOGO_GRADIENTS[hashCode(code) % LOGO_GRADIENTS.length]
}

function toAirline(airline: DuffelAirline): Airline {
  const code = airline.iata_code ?? ''
  return {
    code,
    name: airline.name,
    logoGradient: gradientFor(code || airline.name),
    logoUrl: airline.logo_symbol_url ?? null,
  }
}

function cityOf(airport: DuffelAirport): string {
  return airport.city_name || airport.city?.name || airport.name
}

function flightNumberOf(segment: DuffelSegment): string {
  const code = segment.marketing_carrier.iata_code ?? ''
  return `${code} ${segment.marketing_carrier_flight_number}`.trim()
}

function mapSegment(segment: DuffelSegment): FlightSegment {
  return {
    carrier: toAirline(segment.marketing_carrier),
    flightNumber: flightNumberOf(segment),
    originCode: segment.origin.iata_code ?? '',
    destinationCode: segment.destination.iata_code ?? '',
    departingAt: segment.departing_at,
    arrivingAt: segment.arriving_at,
    durationMin: parseIsoDuration(segment.duration) ?? 0,
    aircraft: segment.aircraft?.name ?? null,
  }
}

function mapSlice(slice: DuffelSlice): FlightSlice {
  const segments = slice.segments
  const first = segments[0]
  const last = segments[segments.length - 1]

  const stops: FlightStop[] = []
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]
    stops.push({
      airportCode: prev.destination.iata_code ?? '',
      city: cityOf(prev.destination),
      layoverMin: localDiffMin(prev.arriving_at, segments[i].departing_at),
    })
  }

  const mappedSegments = segments.map(mapSegment)
  // Slice duration is nullable in Duffel; fall back to flights + layovers.
  const durationMin =
    parseIsoDuration(slice.duration) ??
    mappedSegments.reduce((sum, s) => sum + s.durationMin, 0) + stops.reduce((sum, s) => sum + s.layoverMin, 0)

  return {
    departure: {
      time: first.departing_at.slice(11, 16),
      airportCode: first.origin.iata_code ?? '',
      date: first.departing_at.slice(0, 10),
    },
    arrival: {
      time: last.arriving_at.slice(11, 16),
      airportCode: last.destination.iata_code ?? '',
      dayOffset: localDayDiff(first.departing_at.slice(0, 10), last.arriving_at.slice(0, 10)),
    },
    durationMin,
    stops,
    segments: mappedSegments,
  }
}

function baggageOf(offer: DuffelOffer): Flight['baggage'] {
  const baggages = offer.slices[0]?.segments[0]?.passengers[0]?.baggages ?? []
  return {
    carryOn: baggages.some((b) => b.type === 'carry_on' && b.quantity > 0),
    checkedBags: baggages.filter((b) => b.type === 'checked').reduce((sum, b) => sum + b.quantity, 0),
  }
}

function emissionsKgOf(offer: DuffelOffer): number | null {
  if (offer.total_emissions_kg == null || offer.total_emissions_kg === '') return null
  const kg = Number(offer.total_emissions_kg)
  return Number.isFinite(kg) ? kg : null
}

/** Fee for an allowed refund/change; null when not allowed or the provider gives no amount/currency. */
function penaltyOf(condition: DuffelCondition | null): Money | null {
  if (condition?.allowed !== true) return null
  const { penalty_amount: amount, penalty_currency: currency } = condition
  if (amount == null || amount === '' || !currency) return null
  const value = Number(amount)
  return Number.isFinite(value) ? { amount: value, currency } : null
}

/** Lap infants (under 2, no seat) are sent to Duffel with an age; they do not count as a seat. */
function seatedPassengerCount(offer: DuffelOffer): number {
  const seated = offer.passengers.filter((p) => !(typeof p.age === 'number' && p.age < 2)).length
  return Math.max(1, seated)
}

/**
 * Maps one offer on its own (GET /api/offers/:id). `emissionsKg` is mapped, but the
 * `emissions` bucket is always 'average': it is relative to a result set, and one offer
 * has nothing to rank against. The browser keeps the bucket from the search result.
 */
export function mapSingleOffer(offer: DuffelOffer): Flight {
  const slices = offer.slices.map(mapSlice)
  const outbound = slices[0]
  const totalPrice = Number(offer.total_amount)
  const passengerCount = seatedPassengerCount(offer)
  const refund = offer.conditions?.refund_before_departure ?? null
  const change = offer.conditions?.change_before_departure ?? null
  const refundable = refund?.allowed ?? null
  const changeable = change?.allowed ?? null
  const refundPenalty = penaltyOf(refund)
  const changePenalty = penaltyOf(change)
  // 'flexible' only for a change we know is free; an allowed change with a fee (or unknown fee) is not.
  const tags: FlightTag[] = changeable === true && changePenalty !== null && changePenalty.amount === 0 ? ['flexible'] : []

  return {
    id: offer.id,
    airline: toAirline(offer.owner),
    flightNumber: outbound.segments[0]?.flightNumber ?? '',
    departure: { time: outbound.departure.time, airportCode: outbound.departure.airportCode },
    arrival: outbound.arrival,
    durationMin: outbound.durationMin,
    totalDurationMin: slices.reduce((sum, s) => sum + s.durationMin, 0),
    stops: outbound.stops,
    slices,
    price: Math.round((totalPrice / passengerCount) * 100) / 100,
    totalPrice,
    currency: offer.total_currency,
    // Duffel does not expose remaining seat counts on offers.
    seatsLeft: null,
    tags,
    baggage: baggageOf(offer),
    emissions: 'average',
    emissionsKg: emissionsKgOf(offer),
    expiresAt: offer.expires_at,
    conditions: { refundable, changeable, refundPenalty, changePenalty },
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Maps a result set; emissions buckets are relative to the set's median. */
export function mapOffers(offers: DuffelOffer[]): Flight[] {
  const flights = offers.map(mapSingleOffer)
  const known = flights.map((f) => f.emissionsKg).filter((kg): kg is number => kg !== null)
  if (known.length === 0) return flights
  const med = median(known)
  for (const flight of flights) {
    const kg = flight.emissionsKg
    if (kg === null) continue
    flight.emissions = kg < 0.9 * med ? 'low' : kg > 1.1 * med ? 'high' : 'average'
  }
  return flights
}
