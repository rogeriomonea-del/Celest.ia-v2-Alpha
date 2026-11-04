import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchOffer, fetchPlaces, searchFlights, UNREACHABLE_MESSAGE } from './api'
import { makeFlight } from '../test/flights'
import type { SearchParams } from '../types'

const GRU = { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' }
const LIS = { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' }

const roundtrip: SearchParams = {
  origin: GRU,
  destination: LIS,
  // Local dates near a day boundary: must not shift through UTC.
  departDate: new Date(2026, 11, 1, 23, 30),
  returnDate: new Date(2026, 11, 9),
  passengers: { adults: 2, children: 1, infants: 1 },
  tripType: 'roundtrip',
  cabin: 'business',
}

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: String(url), init: init ?? {} }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the promise to reject')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('searchFlights', () => {
  it('POSTs the mapped round-trip body to /api/flights/search', async () => {
    const offers = [makeFlight()]
    fetchMock.mockResolvedValue(jsonResponse({ offers, searchedAt: '2026-11-04T12:00:00Z' }))
    const controller = new AbortController()

    const result = await searchFlights(roundtrip, controller.signal)

    expect(result.offers).toEqual(offers)
    const { url, init } = lastCall()
    expect(url).toBe('/api/flights/search')
    expect(init.method).toBe('POST')
    expect(init.signal).toBe(controller.signal)
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      origin: 'GRU',
      destination: 'LIS',
      departDate: '2026-12-01',
      returnDate: '2026-12-09',
      passengers: { adults: 2, children: 1, infants: 1 },
      cabin: 'business',
    })
  })

  it('sends returnDate null for one-way, even if a stale return date is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ offers: [], searchedAt: '2026-11-04T12:00:00Z' }))

    await searchFlights({ ...roundtrip, tripType: 'oneway', cabin: 'economy' })

    const body = JSON.parse(String(lastCall().init.body))
    expect(body.returnDate).toBeNull()
    expect(body.departDate).toBe('2026-12-01')
    expect(body.cabin).toBe('economy')
  })

  it('turns an ApiErrorBody into an ApiError with its code, message and status', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_request', message: 'Origem e destino iguais' } }, 400),
    )

    const err = await rejection(searchFlights(roundtrip))

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'invalid_request', message: 'Origem e destino iguais', status: 400 })
  })

  it('maps an HTML 404 (no API behind the dev server) to the friendly message', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!doctype html><title>404</title>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const err = await rejection(searchFlights(roundtrip))

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'internal', message: UNREACHABLE_MESSAGE, status: 404 })
  })

  it('maps a non-2xx JSON body without the error shape to the friendly message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 502))

    const err = await rejection(searchFlights(roundtrip))

    expect(err).toMatchObject({ code: 'internal', message: UNREACHABLE_MESSAGE, status: 502 })
  })

  it('maps a network failure to the friendly message with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const err = await rejection(searchFlights(roundtrip))

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'internal', message: UNREACHABLE_MESSAGE, status: 0 })
  })

  it('lets an AbortError propagate untouched', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    fetchMock.mockRejectedValue(abort)

    const err = await rejection(searchFlights(roundtrip))

    expect(err).toBe(abort)
  })

  it('rejects without calling the API when there is no departure date', async () => {
    await expect(searchFlights({ ...roundtrip, departDate: null })).rejects.toThrow(
      'A data de ida é obrigatória',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchPlaces', () => {
  it('GETs /api/places with the query encoded and returns the places', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [LIS] }))
    const controller = new AbortController()

    const places = await fetchPlaces('São Paulo & co', controller.signal)

    expect(places).toEqual([LIS])
    const { url, init } = lastCall()
    expect(url).toBe('/api/places?q=S%C3%A3o%20Paulo%20%26%20co')
    expect(init.method).toBeUndefined()
    expect(init.signal).toBe(controller.signal)
  })
})

describe('fetchOffer', () => {
  it('GETs /api/offers/<id> with the id encoded and returns the offer', async () => {
    const offer = makeFlight({ id: 'off/1?x' })
    fetchMock.mockResolvedValue(jsonResponse({ offer }))

    expect(await fetchOffer('off/1?x')).toEqual(offer)
    expect(lastCall().url).toBe('/api/offers/off%2F1%3Fx')
  })

  it('surfaces offer_expired as an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'offer_expired', message: 'Esta oferta expirou.' } }, 410),
    )

    await expect(fetchOffer('off_1')).rejects.toMatchObject({ code: 'offer_expired', status: 410 })
  })
})
