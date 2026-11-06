import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findMilesProgram } from '../../src/shared/miles.js'
import type { AwardLookup } from './index.js'
import { AWARD_CACHE_TTL_MS, clearAwardCache, SeatsAeroError, searchAwards } from './seatsAero.js'

const KEY = 'seats_aero_dummy_key_for_unit_tests'
const fetchMock = vi.fn<typeof fetch>()
const connectmiles = findMilesProgram('connectmiles')!

const lookup = (over: Partial<AwardLookup> = {}): AwardLookup => ({
  cabin: 'business',
  origin: 'CUN',
  destination: 'IST',
  date: '2024-05-01',
  returnDate: null,
  program: connectmiles,
  ...over,
})

const options = () => ({ apiKey: KEY, signal: new AbortController().signal })

/** One trip, shaped like the spec's /trips example (minified subset). */
const trip = (over: Record<string, unknown> = {}) => ({
  ID: '2S8Cm9dHORWWKpoCkxfRkZa0e5l',
  TotalDuration: 1133,
  Stops: 1,
  Carriers: 'CM, TK',
  RemainingSeats: 9,
  MileageCost: 70000,
  TotalTaxes: 1290,
  TaxesCurrency: 'USD',
  FlightNumbers: 'CM326, TK800',
  DepartsAt: '2024-05-01T13:52:00Z',
  Cabin: 'business',
  ArrivesAt: '2024-05-02T16:45:00Z',
  UpdatedAt: '2023-07-08T07:12:25.266914Z',
  Source: 'connectmiles',
  ...over,
})

/** One availability row, shaped like the spec's /search example. */
const row = (over: Record<string, unknown> = {}) => ({
  ID: '2QSaUXJ0ZuSVqgrRWqkSlXhnVbS',
  RouteID: '2HmSwbzAS9SnEdtIsf3nkjozpX1',
  Route: {
    ID: '2HmSwbzAS9SnEdtIsf3nkjozpX1',
    OriginAirport: 'CUN',
    OriginRegion: 'North America',
    DestinationAirport: 'IST',
    DestinationRegion: 'Europe',
    NumDaysOut: 75,
    Distance: 6400,
    Source: 'connectmiles',
  },
  Date: '2024-05-01',
  ParsedDate: '2024-05-01T00:00:00Z',
  YAvailable: true,
  WAvailable: false,
  JAvailable: true,
  FAvailable: false,
  YMileageCost: '30000',
  WMileageCost: '0',
  JMileageCost: '70000',
  FMileageCost: '0',
  YRemainingSeats: 0,
  WRemainingSeats: 0,
  JRemainingSeats: 4,
  FRemainingSeats: 0,
  YAirlines: 'CM, TK',
  WAirlines: '',
  JAirlines: 'CM, TK',
  FAirlines: '',
  YDirect: false,
  WDirect: false,
  JDirect: false,
  FDirect: false,
  Source: 'connectmiles',
  CreatedAt: '2023-05-29T08:37:32.218426Z',
  UpdatedAt: '2023-07-10T13:52:23.343425Z',
  AvailabilityTrips: [trip()],
  ...over,
})

const route = (origin: string, destination: string) => ({ ...row().Route, OriginAirport: origin, DestinationAirport: destination })

const ok = (data: unknown[]) =>
  new Response(JSON.stringify({ data, count: data.length, hasMore: false, cursor: 1689009958 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  clearAwardCache()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('searchAwards (seats.aero)', () => {
  it('makes one cached-search GET with the route, date, program, cabin and Partner-Authorization header', async () => {
    fetchMock.mockResolvedValue(ok([]))
    await searchAwards(lookup(), options())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    const sent = new URL(String(url))
    expect(`${sent.origin}${sent.pathname}`).toBe('https://seats.aero/partnerapi/search')
    expect(Object.fromEntries(sent.searchParams)).toEqual({
      origin_airport: 'CUN',
      destination_airport: 'IST',
      start_date: '2024-05-01',
      end_date: '2024-05-01',
      sources: 'connectmiles',
      cabins: 'business',
      include_trips: 'true',
      minify_trips: 'true',
      take: '100',
      order_by: 'lowest_mileage',
    })
    const headers = new Headers(init?.headers)
    expect(headers.get('Partner-Authorization')).toBe(KEY)
    expect(headers.get('Accept')).toBe('application/json')
    expect(init?.method).toBe('GET')
  })

  it('maps trips: minor-unit taxes, flight numbers with a space, seats and stops', async () => {
    fetchMock.mockResolvedValue(ok([row()]))
    const [fare] = await searchAwards(lookup(), options())
    expect(fare).toEqual({
      program: 'connectmiles',
      programName: 'ConnectMiles (Copa)',
      cabin: 'business',
      miles: 70000,
      taxes: { amount: 12.9, currency: 'USD' },
      seatsLeft: 9,
      direct: false,
      flightNumbers: ['CM 326', 'TK 800'],
      matchesItinerary: false,
      source: 'seats_aero',
      fetchedAt: '2023-07-10T13:52:23.343425Z',
      bookingUrl: null,
    })
  })

  it('leaves taxes and seats unknown when the trip has no currency or 0 seats, and keeps other cabins out', async () => {
    const trips = [
      trip({ TaxesCurrency: '', RemainingSeats: 0, Stops: 0, FlightNumbers: 'CM326', MileageCost: 65000 }),
      trip({ Cabin: 'economy', MileageCost: 30000 }),
      trip({ FlightNumbers: 'XYZ-1' }),
    ]
    fetchMock.mockResolvedValue(ok([row({ AvailabilityTrips: trips })]))
    const fares = await searchAwards(lookup(), options())
    expect(fares).toHaveLength(2)
    expect(fares[0]).toMatchObject({ miles: 65000, taxes: null, seatsLeft: null, direct: true, flightNumbers: ['CM 326'] })
    expect(fares[1].flightNumbers).toEqual(['XYZ-1'])
  })

  it('falls back to the availability-level cabin fields when a row has no trips', async () => {
    fetchMock.mockResolvedValue(ok([row({ AvailabilityTrips: null })]))
    expect(await searchAwards(lookup(), options())).toEqual([
      expect.objectContaining({ miles: 70000, taxes: null, seatsLeft: 4, direct: false, flightNumbers: null }),
    ])
    clearAwardCache()
    fetchMock.mockResolvedValue(ok([row({ AvailabilityTrips: [], YRemainingSeats: 0, YDirect: true })]))
    expect(await searchAwards(lookup({ cabin: 'economy' }), options())).toEqual([
      expect.objectContaining({ cabin: 'economy', miles: 30000, seatsLeft: null, direct: true }),
    ])
    clearAwardCache()
    fetchMock.mockResolvedValue(ok([row({ AvailabilityTrips: null })]))
    expect(await searchAwards(lookup({ cabin: 'premium' }), options())).toEqual([])
  })

  it('drops rows for other dates or routes', async () => {
    fetchMock.mockResolvedValue(
      ok([row({ Date: '2024-05-02' }), row({ Route: route('CUN', 'PTY') }), row({ Route: route('IST', 'CUN') })]),
    )
    expect(await searchAwards(lookup(), options())).toEqual([])
  })

  it('throws "chave inválida" on 401 without echoing the key', async () => {
    fetchMock.mockResolvedValue(new Response(`unauthorized key ${KEY}`, { status: 401 }))
    const err = await searchAwards(lookup(), options()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SeatsAeroError)
    const error = err as SeatsAeroError
    expect(error.status).toBe(401)
    expect(error.message).toContain('chave inválida')
    expect(`${error.message} ${error.bodySnippet}`).not.toContain(KEY)
  })

  it('throws "limite de consultas atingido" on 429 and errors on a non-JSON body, caching neither', async () => {
    fetchMock.mockResolvedValueOnce(new Response('slow down', { status: 429 }))
    await expect(searchAwards(lookup(), options())).rejects.toThrow('limite de consultas atingido')
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    await expect(searchAwards(lookup(), options())).rejects.toBeInstanceOf(SeatsAeroError)
    fetchMock.mockResolvedValueOnce(ok([row()]))
    expect(await searchAwards(lookup(), options())).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('answers a repeated lookup from the cache until the TTL expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    fetchMock.mockImplementation(async () => ok([row()]))
    await searchAwards(lookup(), options())
    const again = await searchAwards(lookup(), options())
    expect(again[0].miles).toBe(70000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await searchAwards(lookup({ cabin: 'economy' }), options())
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(AWARD_CACHE_TTL_MS + 1)
    await searchAwards(lookup(), options())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('passes the abort signal to fetch', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        }),
    )
    const pending = searchAwards(lookup(), { apiKey: KEY, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeDefined()
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  describe('round trips', () => {
    const rt = lookup({ origin: 'GRU', destination: 'PTY', date: '2024-05-01', returnDate: '2024-05-10' })
    const out = (over: Record<string, unknown> = {}) =>
      row({ Route: route('GRU', 'PTY'), Date: '2024-05-01', UpdatedAt: '2023-07-10T13:00:00Z', ...over })
    const ret = (over: Record<string, unknown> = {}) =>
      row({ Route: route('PTY', 'GRU'), Date: '2024-05-10', UpdatedAt: '2023-07-09T08:00:00Z', ...over })

    it('fetches both directions in one call and pairs them into one award', async () => {
      fetchMock.mockResolvedValue(
        ok([
          out({ AvailabilityTrips: [trip({ FlightNumbers: 'CM700', MileageCost: 40000, TotalTaxes: 5000, RemainingSeats: 3, Stops: 0 })] }),
          ret({ AvailabilityTrips: [trip({ FlightNumbers: 'CM701', MileageCost: 35000, TotalTaxes: 2550, RemainingSeats: 5, Stops: 0 })] }),
          ret({ Date: '2024-05-04' }),
        ]),
      )
      const fares = await searchAwards(rt, options())
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const sent = new URL(String(fetchMock.mock.calls[0][0])).searchParams
      expect(sent.get('origin_airport')).toBe('GRU,PTY')
      expect(sent.get('destination_airport')).toBe('PTY,GRU')
      expect(sent.get('start_date')).toBe('2024-05-01')
      expect(sent.get('end_date')).toBe('2024-05-10')
      expect(fares).toEqual([
        expect.objectContaining({
          miles: 75000,
          taxes: { amount: 75.5, currency: 'USD' },
          seatsLeft: 3,
          direct: true,
          flightNumbers: ['CM 700', 'CM 701'],
          fetchedAt: '2023-07-09T08:00:00Z',
        }),
      ])
    })

    it('leaves combined taxes, seats and flights unknown when either side lacks them', async () => {
      fetchMock.mockResolvedValue(ok([out({ AvailabilityTrips: [trip({ TaxesCurrency: 'BRL' })] }), ret({ AvailabilityTrips: null })]))
      const [fare] = await searchAwards(rt, options())
      expect(fare).toMatchObject({ miles: 140000, taxes: null, seatsLeft: 4, direct: false, flightNumbers: null })
    })

    it('has no award when one direction has none', async () => {
      fetchMock.mockResolvedValue(ok([out()]))
      expect(await searchAwards(rt, options())).toEqual([])
    })

    it('makes one call per direction when the dates are more than 30 days apart', async () => {
      fetchMock.mockImplementation(async (url) => {
        const from = new URL(String(url)).searchParams.get('origin_airport')
        return ok(from === 'GRU' ? [out()] : [ret({ Date: '2024-07-01' })])
      })
      const fares = await searchAwards({ ...rt, returnDate: '2024-07-01' }, options())
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const params = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams)
      expect(params.map((p) => [p.get('origin_airport'), p.get('start_date'), p.get('end_date')])).toEqual([
        ['GRU', '2024-05-01', '2024-05-01'],
        ['PTY', '2024-07-01', '2024-07-01'],
      ])
      expect(fares.map((f) => f.miles)).toEqual([140000])
    })
  })
})
