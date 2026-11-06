import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorBody, OfferResponse, PlacesResponse, SearchResponse } from '../src/shared/api.js'
import type { AwardFare } from '../src/types.js'
import { POST as searchPOST, GET as searchGET } from '../api/flights/search.js'
import { GET as placesGET } from '../api/places.js'
import { GET as offerGET } from '../api/offers/[id].js'
import type { DuffelOffer } from './duffel.js'
import { SEARCH_TIMEOUT_MS, SUPPLIER_TIMEOUT_MS } from './duffel.js'
import { MESSAGES } from './http.js'
import { AWARD_NOTES } from './awards/index.js'
import { searchAwards } from './awards/seatsAero.js'

// Spy on the award provider; by default it runs the real implementation.
vi.mock('./awards/seatsAero.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./awards/seatsAero.js')>()
  return { searchAwards: vi.fn(actual.searchAwards) }
})
const searchAwardsMock = vi.mocked(searchAwards)
const { searchAwards: realSearchAwards } = await vi.importActual<typeof import('./awards/seatsAero.js')>('./awards/seatsAero.js')
const SEATS_AERO_KEY = 'seats_aero_dummy_key_for_unit_tests'

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
  vi.stubEnv('SEATS_AERO_API_KEY', SEATS_AERO_KEY)
  searchAwardsMock.mockReset().mockImplementation(realSearchAwards)
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
    expect(body.totalOffers).toBe(70)
    expect(body.truncated).toBe(true)
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

  it('keeps an expensive nonstop offer that is beyond the 60 cheapest', async () => {
    const base = fixture.roundTripWithConnection
    const connecting = Array.from({ length: 70 }, (_, i) => ({ ...base, id: `off_c${String(i).padStart(4, '0')}`, total_amount: (5000 + i).toFixed(2) }))
    const direct = { ...fixture.oneWayDirect, id: 'off_direct0001', total_amount: '99999.00' }
    fetchMock.mockResolvedValue(duffelJson({ data: { id: 'orq_1', offers: [...connecting, direct] } }, 201))
    const body = (await (await searchPOST(searchRequest(validSearch))).json()) as SearchResponse
    expect(body.offers).toHaveLength(60)
    expect(body.offers.map((o) => o.id)).toContain('off_direct0001')
    expect(body.offers.find((o) => o.id === 'off_direct0001')?.stops).toEqual([])
    expect(body.totalOffers).toBe(71)
    expect(body.truncated).toBe(true)
  })

  it('reports no truncation when every offer fits', async () => {
    fetchMock.mockResolvedValue(duffelJson({ data: { id: 'orq_1', offers: [fixture.oneWayDirect] } }, 201))
    const body = (await (await searchPOST(searchRequest(validSearch))).json()) as SearchResponse
    expect(body).toMatchObject({ totalOffers: 1, truncated: false })
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

describe('POST /api/flights/search with miles', () => {
  // The fixture offer has one seated passenger, so price = total.
  const pricedOffers = () => [
    { ...fixture.oneWayDirect, id: 'off_miles_cheap', total_amount: '1100.00', total_currency: 'BRL' },
    { ...fixture.oneWayDirect, id: 'off_miles_pricey', total_amount: '2200.00', total_currency: 'BRL' },
  ]
  const duffelOk = () => duffelJson({ data: { id: 'orq_1', offers: pricedOffers() } }, 201)
  const milesSearch = (miles: unknown) => searchRequest({ ...validSearch, miles })

  const award = (cabin: AwardFare['cabin'], miles: number): AwardFare => ({
    program: 'smiles',
    programName: 'Smiles (GOL)',
    cabin,
    miles,
    taxes: { amount: 200, currency: 'BRL' },
    seatsLeft: 2,
    direct: true,
    flightNumbers: null,
    matchesItinerary: false,
    source: 'seats_aero',
    fetchedAt: '2026-11-06T12:00:00.000Z',
    bookingUrl: null,
  })

  const byId = (body: SearchResponse, id: string) => body.offers.find((o) => o.id === id)

  it('leaves miles null on the response and every offer, without calling the award provider, when the request has no miles', async () => {
    fetchMock.mockResolvedValue(duffelOk())
    const res = await searchPOST(searchRequest(validSearch))
    expect(res.status).toBe(200)
    const body = (await res.json()) as SearchResponse
    expect(body.miles).toBeNull()
    expect(body.offers).toHaveLength(2)
    expect(body.offers.every((o) => o.miles === null)).toBe(true)
    expect(searchAwardsMock).not.toHaveBeenCalled()
  })

  it('values every offer, attaches the searched-cabin award and echoes the settings', async () => {
    searchAwardsMock.mockResolvedValue([award('premium', 60_000), award('economy', 10_000)])
    // Duffel only answers once the award lookup has started: the two run in parallel.
    fetchMock.mockImplementation(async () => {
      await vi.waitFor(() => expect(searchAwardsMock).toHaveBeenCalled())
      return duffelOk()
    })

    const res = await searchPOST(milesSearch({ program: 'smiles', milheiroBrl: null, balance: 50_000 }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(SEATS_AERO_KEY)
    const body = JSON.parse(text) as SearchResponse
    expect(body.miles).toEqual({
      program: 'smiles',
      programName: 'Smiles (GOL)',
      milheiroBrl: 22,
      awardSource: 'seats_aero',
      awardsSearched: true,
      awardsNote: null,
    })
    expect(searchAwardsMock.mock.calls[0][0]).toMatchObject({ cabin: 'premium', origin: 'GRU', destination: 'MAD', date: '2026-12-01' })

    const cheap = byId(body, 'off_miles_cheap')?.miles
    const pricey = byId(body, 'off_miles_pricey')?.miles
    // 1100 / 22 x 1000 and 2200 / 22 x 1000
    expect(cheap?.equivalentMiles).toBe(50_000)
    expect(pricey?.equivalentMiles).toBe(100_000)
    expect(cheap?.award?.cabin).toBe('premium')
    expect(cheap?.award?.miles).toBe(60_000)
    const awardOption = (miles: typeof cheap) => miles?.options.find((o) => o.strategy === 'award')
    // Breakeven against each offer's own price: (1100 - 200) / 60 and (2200 - 200) / 60.
    expect(awardOption(cheap)?.breakevenMilheiroBrl).toBe(15)
    expect(awardOption(pricey)?.breakevenMilheiroBrl).toBe(33.33)
    expect(awardOption(pricey)?.notes).toEqual([
      'Vale a pena com milheiro <= R$ 33,33',
      'Saldo insuficiente: faltam 10.000 milhas',
      'Voos podem diferir da oferta',
      'Equivalente em dinheiro: R$ 1.520,00 (milheiro R$ 22,00)',
    ])
    expect(pricey?.options.map((o) => o.strategy)).toEqual(['award', 'cash'])
    expect(cheap?.options.map((o) => o.strategy)).toEqual(['cash', 'award'])
  })

  it('uses the milheiro from the request over the program default, and none when neither has one', async () => {
    fetchMock.mockResolvedValue(duffelOk())
    searchAwardsMock.mockResolvedValue([])
    const own = (await (await searchPOST(milesSearch({ program: 'smiles', milheiroBrl: 25, balance: 0 }))).json()) as SearchResponse
    expect(own.miles?.milheiroBrl).toBe(25)
    expect(byId(own, 'off_miles_cheap')?.miles?.equivalentMiles).toBe(44_000)

    fetchMock.mockResolvedValue(duffelOk())
    const none = (await (await searchPOST(milesSearch({ program: 'lifemiles', milheiroBrl: null, balance: 0 }))).json()) as SearchResponse
    expect(none.miles).toMatchObject({ program: 'lifemiles', milheiroBrl: null, awardsSearched: true })
    expect(byId(none, 'off_miles_cheap')?.miles).toMatchObject({ equivalentMiles: null, award: null })
  })

  it('returns a pt-BR 400 for an unknown program without calling Duffel or the award provider', async () => {
    const res = await searchPOST(milesSearch({ program: 'nao_existe', milheiroBrl: null, balance: 0 }))
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toEqual({ code: 'invalid_request', message: 'Programa de milhas desconhecido.' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(searchAwardsMock).not.toHaveBeenCalled()
  })

  it('still returns valued offers when the award provider fails', async () => {
    // Default implementation: the real provider, which currently throws.
    fetchMock.mockResolvedValue(duffelOk())
    const res = await searchPOST(milesSearch({ program: 'smiles', milheiroBrl: null, balance: 0 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as SearchResponse
    expect(searchAwardsMock).toHaveBeenCalledTimes(1)
    expect(body.miles).toMatchObject({ awardSource: 'seats_aero', awardsSearched: false, awardsNote: AWARD_NOTES.failed })
    expect(body.offers).toHaveLength(2)
    const miles = byId(body, 'off_miles_cheap')?.miles
    expect(miles?.equivalentMiles).toBe(50_000)
    expect(miles?.award).toBeNull()
    expect(miles?.options.map((o) => o.strategy)).toEqual(['cash'])
  })

  it('reports award lookups as not configured without SEATS_AERO_API_KEY', async () => {
    vi.stubEnv('SEATS_AERO_API_KEY', '')
    fetchMock.mockResolvedValue(duffelOk())
    const body = (await (await searchPOST(milesSearch({ program: 'smiles', milheiroBrl: null, balance: 0 }))).json()) as SearchResponse
    expect(body.miles).toMatchObject({ awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.notConfigured })
    expect(searchAwardsMock).not.toHaveBeenCalled()
  })

  it('still fails the search when Duffel fails, even with miles', async () => {
    searchAwardsMock.mockResolvedValue([award('premium', 60_000)])
    fetchMock.mockResolvedValue(duffelJson(duffelErrorBody('internal_server_error', 'api_error'), 500))
    const res = await searchPOST(milesSearch({ program: 'smiles', milheiroBrl: null, balance: 0 }))
    expect(res.status).toBe(502)
    expect((await errorOf(res)).code).toBe('provider_error')
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

  it.each([
    [null, null],
    ['1650', 1650],
  ])("maps emissionsKg (%s) and leaves the single-offer bucket at 'average'", async (kg, expectedKg) => {
    const offer = { ...fixture.roundTripWithConnection, total_emissions_kg: kg }
    fetchMock.mockResolvedValue(duffelJson({ data: offer }))
    const res = await offerGET(offerRequest(offer.id))
    expect(res.status).toBe(200)
    const body = (await res.json()) as OfferResponse
    expect(body.offer.emissionsKg).toBe(expectedKg)
    expect(body.offer.emissions).toBe('average')
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
