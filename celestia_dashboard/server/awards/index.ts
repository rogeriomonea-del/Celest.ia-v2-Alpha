/** Award (miles) availability for a search. Never throws: failures become a pt-BR note. */
import type { SearchRequest } from '../../src/shared/api.js'
import { findMilesProgram } from '../../src/shared/miles.js'
import type { MilesProgramInfo } from '../../src/shared/miles.js'
import type { AwardFare, CabinClass, Flight } from '../../src/types.js'
import type { MilesSettings } from '../miles/calculator.js'
import { SeatsAeroError, searchAwards } from './seatsAero.js'

export const AWARDS_TIMEOUT_MS = 8_000

export const AWARD_NOTES = {
  unsupported: 'Este programa não tem consulta de award disponível.',
  notConfigured: 'Consulta de award não configurada.',
  failed: 'Não foi possível consultar awards agora.',
  dailyLimit: 'Limite diário de consultas de award atingido.',
} as const

export interface AwardLookup {
  cabin: CabinClass
  origin: string
  destination: string
  /** Outbound date, AAAA-MM-DD. */
  date: string
  /** Return date for a round trip (awards then cover both directions); null = one way. */
  returnDate: string | null
  program: MilesProgramInfo
}

export interface AwardLookupResult {
  /** Fewest-miles award per cabin. */
  awardsByCabin: Partial<Record<CabinClass, AwardFare>>
  /** Every award found, for matching each offer's own flights. */
  candidates: AwardFare[]
  awardSource: 'seats_aero' | null
  awardsSearched: boolean
  awardsNote: string | null
}

/** Rejects when the signal aborts, so a provider that ignores its signal still times out. */
function abortion(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

export async function lookupAwards(
  req: SearchRequest,
  settings: MilesSettings,
  signal: AbortSignal,
  timeoutMs = AWARDS_TIMEOUT_MS,
): Promise<AwardLookupResult> {
  const program = findMilesProgram(settings.program)
  if (!program?.awardSource) {
    return { awardsByCabin: {}, candidates: [], awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.unsupported }
  }
  const apiKey = process.env.SEATS_AERO_API_KEY?.trim()
  if (!apiKey) {
    return { awardsByCabin: {}, candidates: [], awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.notConfigured }
  }

  const lookup: AwardLookup = {
    cabin: req.cabin,
    origin: req.origin,
    destination: req.destination,
    date: req.departDate,
    returnDate: req.returnDate,
    program,
  }
  const combined = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  try {
    const awards = await Promise.race([searchAwards(lookup, { apiKey, signal: combined }), abortion(combined)])
    const awardsByCabin: AwardLookupResult['awardsByCabin'] = {}
    for (const award of awards) {
      const best = awardsByCabin[award.cabin]
      if (!best || award.miles < best.miles) awardsByCabin[award.cabin] = award
    }
    return { awardsByCabin, candidates: awards, awardSource: 'seats_aero', awardsSearched: true, awardsNote: null }
  } catch (err) {
    const name = err instanceof Error ? err.name : typeof err
    const message = err instanceof Error ? err.message.split(apiKey).join('[redacted]') : ''
    console.error('[awards] seats.aero lookup failed', name, message)
    const note = err instanceof SeatsAeroError && err.status === 429 ? AWARD_NOTES.dailyLimit : AWARD_NOTES.failed
    return { awardsByCabin: {}, candidates: [], awardSource: 'seats_aero', awardsSearched: false, awardsNote: note }
  }
}

const normalizeFlightNumbers = (numbers: string[]) => numbers.map((n) => n.replace(/\s+/g, '').toUpperCase()).join(',')

/**
 * The award for this offer's exact flights (every slice, in order) when one was found,
 * flagged matchesItinerary; otherwise the cabin's cheapest award, flagged as not matching.
 */
export function awardForOffer(
  offer: Flight,
  candidates: AwardFare[],
  cheapest: AwardFare | null,
  cabin: CabinClass,
): AwardFare | null {
  const wanted = normalizeFlightNumbers(offer.slices.flatMap((slice) => slice.segments.map((segment) => segment.flightNumber)))
  const match = candidates
    .filter((award) => award.cabin === cabin && award.flightNumbers && normalizeFlightNumbers(award.flightNumbers) === wanted)
    .sort((a, b) => a.miles - b.miles)[0]
  if (match) return { ...match, matchesItinerary: true }
  return cheapest ? { ...cheapest, matchesItinerary: false } : null
}
