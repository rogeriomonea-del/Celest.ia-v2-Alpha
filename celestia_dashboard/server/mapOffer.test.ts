import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DuffelOffer } from './duffel.js'
import { gradientFor, LOGO_GRADIENTS, mapOffers, parseIsoDuration } from './mapOffer.js'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/duffel-offers.json', import.meta.url), 'utf8')) as {
  roundTripWithConnection: DuffelOffer
  oneWayDirect: DuffelOffer
}
const roundTrip = fixture.roundTripWithConnection
const oneWay = fixture.oneWayDirect

function withEmissions(offer: DuffelOffer, id: string, kg: string | null): DuffelOffer {
  return { ...offer, id, total_emissions_kg: kg }
}

describe('parseIsoDuration', () => {
  it('parses hours/minutes, days and zero-padded values', () => {
    expect(parseIsoDuration('PT10H35M')).toBe(635)
    expect(parseIsoDuration('PT02H26M')).toBe(146)
    expect(parseIsoDuration('PT45M')).toBe(45)
    expect(parseIsoDuration('P1DT2H')).toBe(1560)
    expect(parseIsoDuration('P1D')).toBe(1440)
    expect(parseIsoDuration('PT1H0M30S')).toBe(61)
  })

  it('returns null for missing or malformed input', () => {
    expect(parseIsoDuration(null)).toBeNull()
    expect(parseIsoDuration('')).toBeNull()
    expect(parseIsoDuration('P')).toBeNull()
    expect(parseIsoDuration('PT')).toBeNull()
    expect(parseIsoDuration('10h')).toBeNull()
  })
})

describe('mapOffers — round trip with a connection', () => {
  const [flight] = mapOffers([roundTrip])

  it('maps both slices with local times, dates and day offsets', () => {
    expect(flight.slices).toHaveLength(2)
    const [out, back] = flight.slices
    expect(out.departure).toEqual({ time: '22:05', airportCode: 'GRU', date: '2026-12-01' })
    expect(out.arrival).toEqual({ time: '15:50', airportCode: 'MAD', dayOffset: 1 })
    expect(out.durationMin).toBe(13 * 60 + 45)
    expect(back.departure).toEqual({ time: '07:10', airportCode: 'MAD', date: '2026-12-15' })
    expect(back.arrival).toEqual({ time: '17:45', airportCode: 'GRU', dayOffset: 0 })
    expect(back.durationMin).toBe(14 * 60 + 35)
  })

  it('computes layovers on the connecting airport local clock', () => {
    expect(flight.slices[0].stops).toEqual([{ airportCode: 'LIS', city: 'Lisbon', layoverMin: 100 }])
    expect(flight.slices[1].stops).toEqual([{ airportCode: 'LIS', city: 'Lisbon', layoverMin: 165 }])
  })

  it('maps segments with carrier, flight number and aircraft', () => {
    const seg = flight.slices[0].segments[0]
    expect(seg).toMatchObject({
      flightNumber: 'TP 82',
      originCode: 'GRU',
      destinationCode: 'LIS',
      departingAt: '2026-12-01T22:05:00',
      arrivingAt: '2026-12-02T11:50:00',
      durationMin: 645,
      aircraft: 'Airbus A330-900',
    })
    expect(seg.carrier.code).toBe('TP')
    expect(flight.slices[0].segments[1].flightNumber).toBe('TP 1026')
  })

  it('mirrors the outbound slice at top level and sums total duration', () => {
    expect(flight.id).toBe('off_0000AkfTrwXBHrv0fn6YhC')
    expect(flight.flightNumber).toBe('TP 82')
    expect(flight.departure).toEqual({ time: '22:05', airportCode: 'GRU' })
    expect(flight.arrival).toEqual(flight.slices[0].arrival)
    expect(flight.durationMin).toBe(825)
    expect(flight.stops).toEqual(flight.slices[0].stops)
    expect(flight.totalDurationMin).toBe(825 + 875)
  })

  it('splits the total price per passenger (2 decimals)', () => {
    expect(flight.totalPrice).toBe(10000)
    expect(flight.price).toBe(3333.33)
    expect(flight.currency).toBe('BRL')
  })

  it('maps owner airline with logo and a palette gradient', () => {
    expect(flight.airline).toEqual({
      code: 'TP',
      name: 'TAP Air Portugal',
      logoUrl: 'https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/TP.svg',
      logoGradient: gradientFor('TP'),
    })
    expect(LOGO_GRADIENTS).toContain(flight.airline.logoGradient)
  })

  it('maps baggage, conditions, tags and expiry', () => {
    expect(flight.baggage).toEqual({ carryOn: true, checkedBags: 1 })
    expect(flight.conditions).toMatchObject({ refundable: false, changeable: true })
    expect(flight.tags).toEqual(['flexible'])
    expect(flight.seatsLeft).toBeNull()
    expect(flight.expiresAt).toBe('2026-11-04T12:30:00.123456Z')
    expect(flight.emissionsKg).toBe(1650)
  })
})

describe('mapOffers — one-way direct', () => {
  const [flight] = mapOffers([oneWay])

  it('maps a direct flight with no stops', () => {
    expect(flight.slices).toHaveLength(1)
    expect(flight.stops).toEqual([])
    expect(flight.departure).toEqual({ time: '23:40', airportCode: 'GRU' })
    expect(flight.arrival).toEqual({ time: '15:30', airportCode: 'LHR', dayOffset: 1 })
    expect(flight.durationMin).toBe(770)
    expect(flight.totalDurationMin).toBe(770)
    expect(flight.flightNumber).toBe('LA 8084')
    expect(flight.slices[0].segments[0].aircraft).toBe('Boeing 787-9')
  })

  it('handles single passenger price, carry-on only and unknown conditions', () => {
    expect(flight.price).toBe(4321.99)
    expect(flight.totalPrice).toBe(4321.99)
    expect(flight.baggage).toEqual({ carryOn: true, checkedBags: 0 })
    expect(flight.conditions).toEqual({ refundable: null, changeable: null, refundPenalty: null, changePenalty: null })
    expect(flight.tags).toEqual([])
  })

  it('falls back to segment durations when the slice duration is null', () => {
    const noDuration = { ...oneWay, slices: [{ ...oneWay.slices[0], duration: null }] }
    expect(mapOffers([noDuration])[0].durationMin).toBe(770)
  })
})

describe('mapOffers — emissions buckets across the result set', () => {
  it('ranks against the median: <0.9× low, >1.1× high, else average', () => {
    // median of [800, 1000, 1050, 1200] = 1025 → low < 922.5, high > 1127.5
    const flights = mapOffers([
      withEmissions(oneWay, 'off_a', '800'),
      withEmissions(oneWay, 'off_b', '1000'),
      withEmissions(oneWay, 'off_c', '1050'),
      withEmissions(oneWay, 'off_d', '1200'),
      withEmissions(oneWay, 'off_e', null),
    ])
    expect(flights.map((f) => [f.id, f.emissions, f.emissionsKg])).toEqual([
      ['off_a', 'low', 800],
      ['off_b', 'average', 1000],
      ['off_c', 'average', 1050],
      ['off_d', 'high', 1200],
      ['off_e', 'average', null],
    ])
  })

  it('marks everything average when no offer has emissions data', () => {
    const flights = mapOffers([withEmissions(oneWay, 'off_a', null), withEmissions(roundTrip, 'off_b', null)])
    expect(flights.map((f) => f.emissions)).toEqual(['average', 'average'])
  })
})

describe('gradientFor', () => {
  it('is deterministic per airline code', () => {
    expect(gradientFor('LA')).toBe(gradientFor('LA'))
    expect(LOGO_GRADIENTS).toContain(gradientFor('AD'))
  })
})
