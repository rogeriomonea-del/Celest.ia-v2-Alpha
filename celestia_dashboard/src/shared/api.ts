/**
 * HTTP contract between the browser app (src/) and the serverless API (api/).
 * Imported by both sides. Runtime imports in this file must stay
 * package-only or use explicit `.js` extensions: the API runs as native ESM
 * on Vercel, where extensionless relative imports fail at runtime.
 */
import { z } from 'zod'
import type { Airport, Flight } from '../types'

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Código IATA inválido')

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD')

export const MAX_SEATED_PASSENGERS = 9

export const searchRequestSchema = z
  .object({
    origin: iata,
    destination: iata,
    departDate: isoDate,
    /** null = one-way. */
    returnDate: isoDate.nullable(),
    passengers: z.object({
      adults: z.number().int().min(1).max(MAX_SEATED_PASSENGERS),
      children: z.number().int().min(0).max(MAX_SEATED_PASSENGERS - 1),
      infants: z.number().int().min(0).max(MAX_SEATED_PASSENGERS),
    }),
    cabin: z.enum(['economy', 'premium', 'business']),
  })
  .superRefine((value, ctx) => {
    if (value.origin === value.destination) {
      ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Origem e destino iguais' })
    }
    if (value.returnDate !== null && value.returnDate < value.departDate) {
      ctx.addIssue({ code: 'custom', path: ['returnDate'], message: 'Volta antes da ida' })
    }
    const { adults, children, infants } = value.passengers
    if (adults + children > MAX_SEATED_PASSENGERS) {
      ctx.addIssue({ code: 'custom', path: ['passengers'], message: 'Máximo de 9 passageiros' })
    }
    if (infants > adults) {
      ctx.addIssue({ code: 'custom', path: ['passengers', 'infants'], message: 'Um bebê por adulto' })
    }
  })

export type SearchRequest = z.infer<typeof searchRequestSchema>

/** POST /api/flights/search — body: SearchRequest */
export interface SearchResponse {
  /** At most MAX_OFFERS, chosen so cheapest, fastest and every stop bucket stay represented. */
  offers: Flight[]
  /** Offers the provider returned before trimming. */
  totalOffers: number
  truncated: boolean
  /** false = provider test mode (fictitious prices). */
  liveMode: boolean
  /** ISO timestamp of when the provider answered. */
  searchedAt: string
}

/** GET /api/places?q=<text> — airport/city suggestions (q: 2–64 chars). */
export interface PlacesResponse {
  places: Airport[]
}

/** GET /api/offers/<offerId> — re-fetches one offer for current price/conditions. */
export interface OfferResponse {
  offer: Flight
  liveMode: boolean
}

export type ApiErrorCode =
  | 'invalid_request'
  | 'provider_not_configured'
  | 'provider_error'
  | 'offer_expired'
  | 'not_found'
  | 'method_not_allowed'
  | 'internal'

/** Body of every non-2xx response from /api/*. `message` is user-facing pt-BR. */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string }
}
