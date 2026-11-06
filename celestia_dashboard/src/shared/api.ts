/**
 * HTTP contract between the browser app (src/) and the serverless API (api/).
 * Imported by both sides. Runtime imports in this file must stay
 * package-only or use explicit `.js` extensions: the API runs as native ESM
 * on Vercel, where extensionless relative imports fail at runtime.
 */
import { z } from 'zod'
import type { Airport, Flight } from '../types'

const iata = (label: string) =>
  z
    .string({ required_error: `Informe ${label}`, invalid_type_error: 'Código IATA inválido' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Código IATA inválido')

const isoDate = (label: string) =>
  z
    .string({ required_error: `Informe ${label}`, invalid_type_error: 'Data deve ser AAAA-MM-DD' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD')

const passengerCount = (invalid: string, min: number, minMessage: string, max: number, maxMessage: string) =>
  z
    .number({ required_error: invalid, invalid_type_error: invalid })
    .int(invalid)
    .min(min, minMessage)
    .max(max, maxMessage)

export const MAX_SEATED_PASSENGERS = 9

/** Optional miles module: which loyalty program to value miles in (and look awards up for). */
export const milesRequestSchema = z.object(
  {
    program: z
      .string({ required_error: 'Informe o programa de milhas', invalid_type_error: 'Programa de milhas inválido' })
      .regex(/^[a-z0-9_]{2,32}$/, 'Programa de milhas inválido'),
    /** BRL per 1,000 miles; null = use the program default (or none). */
    milheiroBrl: z
      .number({ invalid_type_error: 'Milheiro inválido' })
      .positive('Milheiro inválido')
      .max(1000, 'Milheiro inválido')
      .nullable(),
    /** The user's balance in that program, for "saldo insuficiente" notes. */
    balance: z
      .number({ invalid_type_error: 'Saldo de milhas inválido' })
      .int('Saldo de milhas inválido')
      .min(0, 'Saldo de milhas inválido')
      .max(100_000_000, 'Saldo de milhas inválido'),
  },
  { invalid_type_error: 'Dados de milhas inválidos' },
)

export type MilesRequest = z.infer<typeof milesRequestSchema>

export const searchRequestSchema = z
  .object(
    {
      origin: iata('a origem'),
      destination: iata('o destino'),
      departDate: isoDate('a data de ida'),
      /** null = one-way. */
      returnDate: isoDate('a data de volta').nullable(),
      passengers: z.object(
        {
          adults: passengerCount('Número de adultos inválido', 1, 'Pelo menos 1 adulto', MAX_SEATED_PASSENGERS, 'Máximo de 9 passageiros'),
          children: passengerCount('Número de crianças inválido', 0, 'Número de crianças inválido', MAX_SEATED_PASSENGERS - 1, 'Máximo de 9 passageiros'),
          infants: passengerCount('Número de bebês inválido', 0, 'Número de bebês inválido', MAX_SEATED_PASSENGERS, 'Um bebê por adulto'),
        },
        { required_error: 'Informe os passageiros', invalid_type_error: 'Passageiros inválidos' },
      ),
      cabin: z.enum(['economy', 'premium', 'business'], { errorMap: () => ({ message: 'Classe de cabine inválida' }) }),
      miles: milesRequestSchema.optional(),
    },
    { required_error: 'Dados da busca inválidos.', invalid_type_error: 'Dados da busca inválidos.' },
  )
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
  /** Echo of the miles module settings used; null when the request had no `miles`. */
  miles: MilesSummary | null
}

export interface MilesSummary {
  program: string
  programName: string
  /** Milheiro used for valuations; null when neither the request nor the registry had one. */
  milheiroBrl: number | null
  /** Award provider consulted for this program; null when none applies or none is configured. */
  awardSource: 'seats_aero' | null
  awardsSearched: boolean
  /** User-facing pt-BR note when awards could not be searched (not configured, provider error, program unsupported). */
  awardsNote: string | null
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
