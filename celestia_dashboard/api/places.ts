import type { Airport } from '../src/types.js'
import type { PlacesResponse } from '../src/shared/api.js'
import { placeSuggestions } from '../server/duffel.js'
import type { DuffelAirport, DuffelPlace } from '../server/duffel.js'
import { errorResponse, handleError, json, methodNotAllowed } from '../server/http.js'

export const MAX_PLACES = 10
const CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' }

function toAirport(place: Omit<DuffelAirport, 'type'>, fallbackCity?: string): Airport | null {
  if (!place.iata_code) return null
  return {
    code: place.iata_code,
    city: place.city_name || place.city?.name || fallbackCity || place.name,
    name: place.name,
    country: place.iata_country_code,
  }
}

/** Airports as-is; a city expands to its airports, or to its own code when it lists none. */
export function toAirports(places: DuffelPlace[]): Airport[] {
  const byCode = new Map<string, Airport>()
  const add = (airport: Airport | null) => {
    if (airport && !byCode.has(airport.code)) byCode.set(airport.code, airport)
  }
  for (const place of places) {
    if (place.type === 'airport') {
      add(toAirport(place))
    } else if (place.type === 'city') {
      const airports = place.airports ?? []
      if (airports.length > 0) airports.forEach((a) => add(toAirport(a, place.name)))
      else add(toAirport(place))
    }
  }
  return [...byCode.values()].slice(0, MAX_PLACES)
}

/** GET /api/places?q=<text> -> PlacesResponse. */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2 || q.length > 64) {
    return errorResponse('invalid_request', 'Digite de 2 a 64 caracteres para buscar.', 400)
  }
  try {
    const body: PlacesResponse = { places: toAirports(await placeSuggestions(q)) }
    return json(body, 200, CACHE)
  } catch (err) {
    return handleError(err)
  }
}

const notAllowed = methodNotAllowed(['GET'])
export { notAllowed as POST, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE }
