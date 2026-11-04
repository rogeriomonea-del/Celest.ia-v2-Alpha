import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorBody, OfferResponse, PlacesResponse, SearchResponse } from '../src/shared/api.js'
import { POST as searchPOST, GET as searchGET } from '../api/flights/search.js'
import { GET as placesGET } from '../api/places.js'
import { GET as offerGET } from '../api/offers/[id].js'
import type { DuffelOffer } from './duffel.js'
import { SEARCH_TIMEOUT_MS, SUPPLIER_TIMEOUT_MS } from './duffel.js'
import { MESSAGES } from './http.js'

const TOKEN = 'duffel_test_dummy_token_for_unit_tests'
const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/duffel-offers.json', import.meta.url), 'utf8')) as {
  roundTripWithConnection: DuffelOffer
  oneWayDirect: DuffelOffer
}

const fetchMock = vi.fn<typeof fetch>()

function duffelJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function duffelErrorBody(code: string, type: string, message = 'Something went wrong') {
  return {
    meta: { status: 422, request_id: 'FZW0H3HdJwKk5HMAAKxB' },
    errors: [{ code, type, title: 'Error', message, documentation_url: 'https://duffel.com/docs/api/overview/response-handling' }],
  }
}

const validSearch = {
  origin: 'gru',
  destination: 'MAD',
  departDate: '2026-12-01',
  returnDate: '2026-12-15',
  passengers: { adults: 2, children: 1, infants: 1 },
  cabin: 'premium',
}

function searchRequest(body: unknown): Request {
  return new Request('https://celestia.test/api/flights/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function errorOf(response: Response): Promise<ApiErrorBody['error']> {
  const body = (await response.json()) as ApiErrorBody
  return body.error
}

function expectCredentialRejectedLogged(status: number) {
  const logged = vi.mocked(console.error).mock.calls.map((args) => args.map(String).join(' '))
  expect(logged.some((line) => line.includes('Duffel credential rejected') && line.includes(String(status)))).toBe(true)
  expect(logged.join('\n')).not.toContain(TOKEN)
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('DUFFEL_ACCESS_TOKEN', TOKEN)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('POST /api/flights/search', () => {
  it('returns 503 provider_not_configured without a token and never calls Duffel', async () => {
    vi.stubEnv('DUFFEL_ACCESS_TOKEN', '')
    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(503)
    expect((await errorOf(res)).code).toBe('provider_not_configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_request with the first zod message for an invalid body', async () => {
    const res = await searchPOST(searchRequest({ ...validSearch, destination: 'GRU' }))
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toEqual({ code: 'invalid_request', message: 'Origem e destino iguais' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty body', {}, 'Informe a origem'],
    ['a missing departDate', { ...validSearch, departDate: undefined }, 'Informe a data de ida'],
    ['a bad cabin', { ...validSearch, cabin: 'first' }, 'Classe de cabine inválida'],
    ['a missing cabin', { ...validSearch, cabin: undefined }, 'Classe de cabine inválida'],
    ['missing passengers', { ...validSearch, passengers: undefined }, 'Informe os passageiros'],
    ['a string adult count', { ...validSearch, passengers: { adults: '2', children: 0, infants: 0 } }, 'Número de adultos inválido'],
    ['zero adults', { ...validSearch, passengers: { adults: 0, children: 0, infants: 0 } }, 'Pelo menos 1 adulto'],
    ['too many children', { ...validSearch, passengers: { adults: 1, children: 9, infants: 0 } }, 'Máximo de 9 passageiros'],
    ['a numeric origin', { ...validSearch, origin: 123 }, 'Código IATA inválido'],
    ['a JSON array', [], 'Dados da busca inválidos.'],
    ['JSON null', null, 'Dados da busca inválidos.'],
  ])('returns a pt-BR 400 message for %s', async (_label, body, message) => {
    const res = await searchPOST(searchRequest(body))
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toEqual({ code: 'invalid_request', message })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_request for a non-JSON body', async () => {
    const res = await searchPOST(searchRequest('{not json'))
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('invalid_request')
  })

  it('returns 405 method_not_allowed for other methods', async () => {
    const res = searchGET(new Request('https://celestia.test/api/flights/search'))
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('POST')
    expect((await errorOf(res)).code).toBe('method_not_allowed')
  })

  it('maps a Duffel 422 validation error to 400 invalid_request', async () => {
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody('validation_error', 'validation_error'), 422))
    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(400)
    const error = await errorOf(res)
    expect(error.code).toBe('invalid_request')
    expect(error.message).not.toContain('Something went wrong')
  })

  it.each([401, 403])('maps a Duffel %i (bad/revoked token) to 503 provider_not_configured', async (status) => {
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody('unauthorized', 'authentication_error'), status))
    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(503)
    expect(await errorOf(res)).toEqual({ code: 'provider_not_configured', message: MESSAGES.notConfigured })
    expectCredentialRejectedLogged(status)
  })

  it('maps a Duffel 5xx to 502 provider_error', async () => {
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody('internal_server_error', 'api_error'), 500))
    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(502)
    expect((await errorOf(res)).code).toBe('provider_error')
  })

  it('maps a network failure to 502 provider_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(502)
    expect((await errorOf(res)).code).toBe('provider_error')
  })

  it('aborts after the search timeout and returns 502 provider_error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = searchPOST(searchRequest(validSearch))
    while (fetchMock.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS - 1)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const res = await pending
    expect(res.status).toBe(502)
    expect((await errorOf(res)).code).toBe('provider_error')
  })

  it('sends a v2 offer request and returns offers sorted by total price, capped at 60', async () => {
    const base = fixture.roundTripWithConnection
    // 70 offers with descending prices: result must be ascending and capped.
    const offers = Array.from({ length: 70 }, (_, i) => ({
      ...base,
      id: `off_${String(i).padStart(4, '0')}`,
      total_amount: (20000 - i * 100).toFixed(2),
    }))
    fetchMock.mockResolvedValue(duffelJson({ data: { id: 'orq_0000AkfTqUQ5iW5PzzpHCh', live_mode: false, offers } }, 201))

    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as SearchResponse
    expect(body.offers).toHaveLength(60)
    const prices = body.offers.map((o) => o.totalPrice)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(prices[0]).toBe(13100)
    expect(Number.isNaN(Date.parse(body.searchedAt))).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    const sent = new URL(String(url))
    expect(sent.origin + sent.pathname).toBe('https://api.duffel.com/air/offer_requests')
    expect(sent.searchParams.get('return_offers')).toBe('true')
    expect(sent.searchParams.get('supplier_timeout')).toBe(String(SUPPLIER_TIMEOUT_MS))
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('Duffel-Version')).toBe('v2')
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Content-Type')).toBe('application/json')

    const sentBody = JSON.parse(String(init?.body))
    expect(sentBody).toEqual({
      data: {
        slices: [
          { origin: 'GRU', destination: 'MAD', departure_date: '2026-12-01' },
          { origin: 'MAD', destination: 'GRU', departure_date: '2026-12-15' },
        ],
        passengers: [{ type: 'adult' }, { type: 'adult' }, { age: 8 }, { age: 1 }],
        cabin_class: 'premium_economy',
        max_connections: 2,
      },
    })
  })

  it.each([
    [true, true],
    [false, false],
    [undefined, false],
  ])('reports liveMode from the offer request live_mode (%s -> %s)', async (liveMode, expected) => {
    fetchMock.mockResolvedValue(duffelJson({ data: { id: 'orq_1', live_mode: liveMode, offers: [fixture.oneWayDirect] } }, 201))
    const body = (await (await searchPOST(searchRequest(validSearch))).json()) as SearchResponse
    expect(body.liveMode).toBe(expected)
  })

  it('sends a single slice for one-way searches and never leaks the token', async () => {
    fetchMock.mockResolvedValue(duffelJson({ data: { id: 'orq_1', offers: [fixture.oneWayDirect] } }, 201))
    const res = await searchPOST(searchRequest({ ...validSearch, returnDate: null, cabin: 'business' }))
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain(TOKEN)
    const sentBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sentBody.data.slices).toHaveLength(1)
    expect(sentBody.data.cabin_class).toBe('business')
  })
})

describe('GET /api/places', () => {
  const placesRequest = (q: string) => new Request(`https://celestia.test/api/places?q=${encodeURIComponent(q)}`)

  it('rejects a query shorter than 2 characters (after trim) with 400', async () => {
    const res = await placesGET(placesRequest(' a '))
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('invalid_request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a query longer than 64 characters with 400', async () => {
    const res = await placesGET(placesRequest('x'.repeat(65)))
    expect(res.status).toBe(400)
  })

  it('maps airports and expands cities, deduped, with a CDN cache header', async () => {
    const gru = fixture.roundTripWithConnection.slices[0].segments[0].origin
    const city = {
      type: 'city',
      id: 'cit_sao_br',
      name: 'São Paulo',
      iata_code: 'SAO',
      iata_country_code: 'BR',
      iata_city_code: 'SAO',
      city_name: null,
      city: null,
      time_zone: null,
      latitude: null,
      longitude: null,
      icao_code: null,
      airports: [
        gru,
        { ...gru, id: 'arp_cgh_br', iata_code: 'CGH', icao_code: 'SBSP', name: 'Congonhas Airport', city_name: null },
      ],
    }
    const noAirportsCity = { ...city, id: 'cit_xyz', name: 'Cityville', iata_code: 'XYZ', airports: [] }
    fetchMock.mockResolvedValue(duffelJson({ data: [{ ...gru, airports: null }, city, noAirportsCity] }))

    const res = await placesGET(placesRequest('  sao paulo '))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=86400, stale-while-revalidate=604800')
    const body = (await res.json()) as PlacesResponse
    expect(body.places).toEqual([
      { code: 'GRU', city: 'São Paulo', name: gru.name, country: 'BR' },
      { code: 'CGH', city: 'São Paulo', name: 'Congonhas Airport', country: 'BR' },
      { code: 'XYZ', city: 'Cityville', name: 'Cityville', country: 'BR' },
    ])

    const sent = new URL(String(fetchMock.mock.calls[0][0]))
    expect(sent.origin + sent.pathname).toBe('https://api.duffel.com/places/suggestions')
    expect(sent.searchParams.get('name')).toBe('sao paulo')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Duffel-Version')).toBe('v2')
  })

  it('caps suggestions at 10', async () => {
    const gru = fixture.roundTripWithConnection.slices[0].segments[0].origin
    const many = Array.from({ length: 15 }, (_, i) => ({ ...gru, airports: null, iata_code: `A${String(i).padStart(2, '0')}` }))
    fetchMock.mockResolvedValue(duffelJson({ data: many }))
    const body = (await (await placesGET(placesRequest('aa'))).json()) as PlacesResponse
    expect(body.places).toHaveLength(10)
  })

  it('returns 503 without a token', async () => {
    vi.stubEnv('DUFFEL_ACCESS_TOKEN', '')
    const res = await placesGET(placesRequest('lisboa'))
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('GET /api/offers/[id]', () => {
  const offerRequest = (id: string) => new Request(`https://celestia.test/api/offers/${id}?id=${encodeURIComponent(id)}`)

  it('rejects a malformed id with 400 and never calls Duffel', async () => {
    const res = await offerGET(offerRequest('orq_123'))
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('invalid_request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the mapped offer', async () => {
    const offer = fixture.roundTripWithConnection
    fetchMock.mockResolvedValue(duffelJson({ data: offer }))
    const res = await offerGET(offerRequest(offer.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as OfferResponse
    expect(body.offer.id).toBe(offer.id)
    expect(body.offer.price).toBe(3333.33)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.duffel.com/air/offers/${offer.id}`)
  })

  it.each([
    [true, true],
    [false, false],
    [undefined, false],
  ])('reports liveMode from the offer live_mode (%s -> %s)', async (liveMode, expected) => {
    const offer = { ...fixture.oneWayDirect, live_mode: liveMode }
    fetchMock.mockResolvedValue(duffelJson({ data: offer }))
    const body = (await (await offerGET(offerRequest(offer.id))).json()) as OfferResponse
    expect(body.liveMode).toBe(expected)
  })

  it('reads the id from the path when no query param is present', async () => {
    fetchMock.mockResolvedValue(duffelJson({ data: fixture.oneWayDirect }))
    const res = await offerGET(new Request(`https://celestia.test/api/offers/${fixture.oneWayDirect.id}`))
    expect(res.status).toBe(200)
  })

  it.each(['offer_no_longer_available', 'offer_expired'])('maps Duffel %s to 410 offer_expired', async (code) => {
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody(code, 'invalid_request_error'), 422))
    const res = await offerGET(offerRequest('off_0000AkfTrwXBHrv0fn6YhC'))
    expect(res.status).toBe(410)
    expect((await errorOf(res)).code).toBe('offer_expired')
  })

  it('maps a Duffel 404 to 404 not_found', async () => {
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody('not_found', 'invalid_request_error'), 404))
    const res = await offerGET(offerRequest('off_0000AkfTrwXBHrv0fn6YhC'))
    expect(res.status).toBe(404)
    expect((await errorOf(res)).code).toBe('not_found')
  })

  it.each([401, 403])('maps a Duffel %i (bad/revoked token) to 503 provider_not_configured', async (status) => {
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody('unauthorized', 'authentication_error'), status))
    const res = await offerGET(offerRequest('off_0000AkfTrwXBHrv0fn6YhC'))
    expect(res.status).toBe(503)
    expect(await errorOf(res)).toEqual({ code: 'provider_not_configured', message: MESSAGES.notConfigured })
    expectCredentialRejectedLogged(status)
  })
})
