import { searchRequestSchema } from '../../src/shared/api.js'
import type { SearchResponse } from '../../src/shared/api.js'
import { createOfferRequest } from '../../server/duffel.js'
import { handleError, json, methodNotAllowed, NO_STORE, parseJsonBody, validationErrorResponse } from '../../server/http.js'
import { mapOffers } from '../../server/mapOffer.js'

export const MAX_OFFERS = 60

/** POST /api/flights/search — body: SearchRequest -> SearchResponse. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = searchRequestSchema.safeParse(await parseJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await createOfferRequest(parsed.data)
    const all = mapOffers(result.offers).sort(
      (a, b) => a.totalPrice - b.totalPrice,
    )
    const offers = all.slice(0, MAX_OFFERS)
    const body: SearchResponse = {
      offers,
      totalOffers: all.length,
      truncated: all.length > offers.length,
      liveMode: result.liveMode,
      searchedAt: new Date().toISOString(),
    }
    return json(body, 200, NO_STORE)
  } catch (err) {
    return handleError(err)
  }
}

const notAllowed = methodNotAllowed(['POST'])
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE }
