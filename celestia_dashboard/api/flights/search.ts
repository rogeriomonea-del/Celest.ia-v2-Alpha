import { searchRequestSchema } from '../../src/shared/api.js'
import type { SearchResponse } from '../../src/shared/api.js'
import { createOfferRequest } from '../../server/duffel.js'
import { handleError, json, methodNotAllowed, NO_STORE, parseJsonBody, validationErrorResponse } from '../../server/http.js'
import { mapOffers } from '../../server/mapOffer.js'
import { selectOffers } from '../../server/selectOffers.js'

/** POST /api/flights/search — body: SearchRequest -> SearchResponse. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = searchRequestSchema.safeParse(await parseJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await createOfferRequest(parsed.data)
    // Emissions buckets are ranked over every offer, before trimming.
    const all = mapOffers(result.offers)
    const offers = selectOffers(all)
    const body: SearchResponse = {
      offers,
      totalOffers: all.length,
      truncated: all.length > offers.length,
      liveMode: result.liveMode,
      searchedAt: new Date().toISOString(),
      miles: null,
    }
    return json(body, 200, NO_STORE)
  } catch (err) {
    return handleError(err)
  }
}

const notAllowed = methodNotAllowed(['POST'])
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE }
