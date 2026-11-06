import type { OfferResponse } from '../../src/shared/api.js'
import { getOffer } from '../../server/duffel.js'
import { errorResponse, handleError, json, methodNotAllowed, NO_STORE } from '../../server/http.js'
import { mapSingleOffer } from '../../server/mapOffer.js'

const OFFER_ID = /^off_[A-Za-z0-9]+$/

/** Vercel passes the [id] segment as ?id=; fall back to the last path segment. */
function offerIdFrom(request: Request): string {
  const url = new URL(request.url)
  const fromQuery = url.searchParams.get('id')
  if (fromQuery !== null) return fromQuery
  return url.pathname.split('/').filter(Boolean).pop() ?? ''
}

/** GET /api/offers/<offerId> -> OfferResponse. */
export async function GET(request: Request): Promise<Response> {
  const id = offerIdFrom(request)
  if (!OFFER_ID.test(id)) {
    return errorResponse('invalid_request', 'Identificador de oferta inválido.', 400)
  }
  try {
    const duffelOffer = await getOffer(id)
    // emissions stays 'average' here (no result set to rank against); emissionsKg is mapped.
    const offer = mapSingleOffer(duffelOffer)
    const body: OfferResponse = { offer, liveMode: duffelOffer.live_mode === true }
    return json(body, 200, NO_STORE)
  } catch (err) {
    return handleError(err, { offerLookup: true })
  }
}

const notAllowed = methodNotAllowed(['GET'])
export { notAllowed as POST, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE }
