import { describe, expect, it } from 'vitest'
import type { Airline, Flight, FlightStop } from '../src/types.js'
import { LATAM, makeFlight, TAP } from '../src/test/flights.js'
import { MAX_OFFERS, selectOffers } from './selectOffers.js'

const LIS: FlightStop = { airportCode: 'LIS', city: 'Lisboa', layoverMin: 120 }
const stopsOf = (n: number): FlightStop[] => Array.from({ length: n }, () => LIS)

function offer(id: string, totalPrice: number, opts: { stops?: number; minutes?: number; airline?: Airline } = {}): Flight {
  return makeFlight({
    id,
    totalPrice,
    price: totalPrice,
    stops: stopsOf(opts.stops ?? 1),
    totalDurationMin: opts.minutes ?? 900,
    airline: opts.airline ?? LATAM,
  })
}

/** n one-stop LATAM offers priced 1000, 1010, … with the same 900-minute duration. */
const bulk = (n: number) => Array.from({ length: n }, (_, i) => offer(`off_bulk_${i}`, 1000 + i * 10))

const ids = (flights: Flight[]) => flights.map((f) => f.id)

describe('selectOffers', () => {
  it('returns everything, sorted by total price, when under the cap', () => {
    const flights = [offer('off_b', 300), offer('off_a', 100), offer('off_c', 200)]
    expect(ids(selectOffers(flights))).toEqual(['off_a', 'off_c', 'off_b'])
  })

  it('caps at MAX_OFFERS, fills by price, and never duplicates', () => {
    const result = selectOffers(bulk(100))
    expect(result).toHaveLength(MAX_OFFERS)
    expect(new Set(ids(result)).size).toBe(MAX_OFFERS)
    expect(ids(result)).toEqual(ids(bulk(MAX_OFFERS)))
  })

  it('keeps an expensive direct offer that sits beyond position 60 by price', () => {
    const direct = offer('off_direct', 99_999, { stops: 0 })
    const result = selectOffers([...bulk(100), direct])
    expect(result).toHaveLength(MAX_OFFERS)
    expect(ids(result)).toContain('off_direct')
    expect(result[result.length - 1].id).toBe('off_direct')
  })

  it('keeps the 5 cheapest of each stop bucket, counting 3+ stops as 2+', () => {
    const twoPlus = [2, 3, 2, 4, 2, 3].map((stops, i) => offer(`off_2p_${i}`, 50_000 + i, { stops }))
    const result = ids(selectOffers([...bulk(100), ...twoPlus]))
    expect(result).toEqual(expect.arrayContaining(['off_2p_0', 'off_2p_1', 'off_2p_2', 'off_2p_3', 'off_2p_4']))
    expect(result).not.toContain('off_2p_5')
  })

  it('keeps the 20 fastest by total duration, even when expensive', () => {
    const fast = Array.from({ length: 21 }, (_, i) => offer(`off_fast_${i}`, 80_000 + i, { minutes: 300 + i }))
    const result = ids(selectOffers([...bulk(100), ...fast]))
    expect(result).toEqual(expect.arrayContaining(fast.slice(0, 20).map((f) => f.id)))
    expect(result).not.toContain('off_fast_20')
  })

  it('keeps the cheapest offer of every owner airline', () => {
    const tapExpensive = offer('off_tap_1', 70_000, { airline: TAP })
    const tapPricier = offer('off_tap_2', 70_500, { airline: TAP })
    const result = ids(selectOffers([...bulk(100), tapPricier, tapExpensive]))
    expect(result).toContain('off_tap_1')
    expect(result).not.toContain('off_tap_2')
  })

  it('respects a custom cap', () => {
    expect(selectOffers(bulk(10), 3)).toHaveLength(3)
  })
})
