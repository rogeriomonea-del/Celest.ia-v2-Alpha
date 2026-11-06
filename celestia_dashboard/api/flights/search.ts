import { searchRequestSchema } from '../../src/shared/api.js'
import type { MilesSummary, SearchResponse } from '../../src/shared/api.js'
import { findMilesProgram } from '../../src/shared/miles.js'
import { awardForOffer, lookupAwards } from '../../server/awards/index.js'
import type { AwardLookupResult } from '../../server/awards/index.js'
import { createOfferRequest } from '../../server/duffel.js'
import { errorResponse, handleError, json, methodNotAllowed, NO_STORE, parseJsonBody, validationErrorResponse } from '../../server/http.js'
import { mapOffers } from '../../server/mapOffer.js'
import { valueOffer } from '../../server/miles/calculator.js'
import type { MilesSettings } from '../../server/miles/calculator.js'
import { selectOffers } from '../../server/selectOffers.js'

/** POST /api/flights/search — body: SearchRequest -> SearchResponse. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = searchRequestSchema.safeParse(await parseJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const req = parsed.data

    let settings: MilesSettings | null = null
    if (req.miles) {
      const program = findMilesProgram(req.miles.program)
      if (!program) return errorResponse('invalid_request', 'Programa de milhas desconhecido.', 400)
      settings = {
        program: program.code,
        programName: program.name,
        milheiroBrl: req.miles.milheiroBrl ?? program.defaultMilheiroBrl,
        balance: req.miles.balance,
        passengers: req.passengers.adults + req.passengers.children,
      }
    }

    // Award lookups never reject, so they cannot fail the search.
    const [result, awards] = await Promise.all([
      createOfferRequest(req),
      settings ? lookupAwards(req, settings, request.signal) : Promise.resolve<AwardLookupResult | null>(null),
    ])
    // Emissions buckets are ranked over every offer, before trimming.
    const all = mapOffers(result.offers)
    let offers = selectOffers(all)
    let miles: MilesSummary | null = null
    if (settings && awards) {
      const milesSettings = settings
      // Duffel offers are all in the searched cabin, so that cabin's awards are the ones to compare:
      // the one for the offer's own flights when found, else the cheapest.
      const cheapest = awards.awardsByCabin[req.cabin] ?? null
      offers = offers.map((offer) => ({
        ...offer,
        miles: valueOffer(offer, milesSettings, awardForOffer(offer, awards.candidates, cheapest, req.cabin), req.cabin),
      }))
      miles = {
        program: settings.program,
        programName: settings.programName,
        milheiroBrl: settings.milheiroBrl,
        awardSource: awards.awardSource,
        awardsSearched: awards.awardsSearched,
        awardsNote: awards.awardsNote,
      }
    }
    const body: SearchResponse = {
      offers,
      totalOffers: all.length,
      truncated: all.length > offers.length,
      liveMode: result.liveMode,
      searchedAt: new Date().toISOString(),
      miles,
    }
    return json(body, 200, NO_STORE)
  } catch (err) {
    return handleError(err)
  }
}

const notAllowed = methodNotAllowed(['POST'])
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE }
