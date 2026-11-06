/** seats.aero award availability client. Server-only; the API key is never logged or returned. */
import type { AwardFare } from '../../src/types.js'
import type { AwardLookup } from './index.js'

export interface SeatsAeroOptions {
  /** Sent as the Partner-Authorization header. */
  apiKey: string
  signal: AbortSignal
}

/** Award fares found for the lookup's route and date (any cabin). Stub until the seats.aero round. */
export async function searchAwards(_lookup: AwardLookup, _options: SeatsAeroOptions): Promise<AwardFare[]> {
  throw new Error('not implemented')
}
