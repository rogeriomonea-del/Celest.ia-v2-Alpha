/** Typed browser client for the /api functions. */
import type {
  ApiErrorBody,
  ApiErrorCode,
  OfferResponse,
  PlacesResponse,
  SearchRequest,
  SearchResponse,
} from '../shared/api'
import type { MilesPrefs } from '../features/miles/useMilesPrefs'
import type { Airport, Flight, SearchParams } from '../types'
import { toISODate } from '../utils/dates'

export const UNREACHABLE_MESSAGE =
  'Não foi possível conectar ao serviço de voos. Verifique sua conexão e tente novamente.'

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  const error = (value as ApiErrorBody | null)?.error
  return typeof error?.code === 'string' && typeof error.message === 'string'
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init.headers } })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new ApiError('internal', UNREACHABLE_MESSAGE, 0)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    if (isAbort(err)) throw err
    // e.g. plain `vite` without `vercel dev` answers /api with an HTML 404.
    throw new ApiError('internal', UNREACHABLE_MESSAGE, response.status)
  }
  if (!response.ok) {
    if (isErrorBody(body)) throw new ApiError(body.error.code, body.error.message, response.status)
    throw new ApiError('internal', UNREACHABLE_MESSAGE, response.status)
  }
  return body as T
}

/** SearchParams -> wire body. Throws when there is no departure date. */
export function toSearchRequest(params: SearchParams): SearchRequest {
  if (!params.departDate) throw new Error('A data de ida é obrigatória')
  return {
    origin: params.origin.code,
    destination: params.destination.code,
    departDate: toISODate(params.departDate),
    returnDate:
      params.tripType === 'roundtrip' && params.returnDate ? toISODate(params.returnDate) : null,
    passengers: { ...params.passengers },
    cabin: params.cabin,
  }
}

/** `miles` is sent only when the user enabled the miles module. */
export async function searchFlights(
  params: SearchParams,
  signal?: AbortSignal,
  miles: MilesPrefs | null = null,
): Promise<SearchResponse> {
  const body: SearchRequest = toSearchRequest(params)
  if (miles?.enabled) {
    body.miles = { program: miles.program, milheiroBrl: miles.milheiroBrl, balance: miles.balance }
  }
  return request<SearchResponse>('/api/flights/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

export async function fetchPlaces(q: string, signal?: AbortSignal): Promise<Airport[]> {
  const body = await request<PlacesResponse>(`/api/places?q=${encodeURIComponent(q)}`, { signal })
  return body.places
}

export async function fetchOffer(id: string, signal?: AbortSignal): Promise<Flight> {
  const body = await request<OfferResponse>(`/api/offers/${encodeURIComponent(id)}`, { signal })
  return body.offer
}
