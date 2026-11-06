/** Award (miles) availability for a search. Never throws: failures become a pt-BR note. */
import type { SearchRequest } from '../../src/shared/api.js'
import { findMilesProgram } from '../../src/shared/miles.js'
import type { MilesProgramInfo } from '../../src/shared/miles.js'
import type { AwardFare, CabinClass } from '../../src/types.js'
import type { MilesSettings } from '../miles/calculator.js'
import { searchAwards } from './seatsAero.js'

export const AWARDS_TIMEOUT_MS = 8_000

export const AWARD_NOTES = {
  unsupported: 'Este programa não tem consulta de award disponível.',
  notConfigured: 'Consulta de award não configurada.',
  failed: 'Não foi possível consultar awards agora.',
} as const

export interface AwardLookup {
  cabin: CabinClass
  origin: string
  destination: string
  /** Outbound date, AAAA-MM-DD. */
  date: string
  program: MilesProgramInfo
}

export interface AwardLookupResult {
  /** Fewest-miles award per cabin. */
  awardsByCabin: Partial<Record<CabinClass, AwardFare>>
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
    return { awardsByCabin: {}, awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.unsupported }
  }
  const apiKey = process.env.SEATS_AERO_API_KEY?.trim()
  if (!apiKey) {
    return { awardsByCabin: {}, awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.notConfigured }
  }

  const lookup: AwardLookup = {
    cabin: req.cabin,
    origin: req.origin,
    destination: req.destination,
    date: req.departDate,
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
    return { awardsByCabin, awardSource: 'seats_aero', awardsSearched: true, awardsNote: null }
  } catch (err) {
    const name = err instanceof Error ? err.name : typeof err
    const message = err instanceof Error ? err.message.split(apiKey).join('[redacted]') : ''
    console.error('[awards] seats.aero lookup failed', name, message)
    return { awardsByCabin: {}, awardSource: 'seats_aero', awardsSearched: false, awardsNote: AWARD_NOTES.failed }
  }
}
