import { describe, expect, it } from 'vitest'
import { sortFlights } from './flightLogic'
import type { Flight } from '../types'

const flight = (id: string, price: number, durationMin: number): Flight =>
  ({ id, price, durationMin, totalDurationMin: durationMin, stops: [] }) as unknown as Flight

describe('sortFlights', () => {
  it('orders by price for "cheapest"', () => {
    const sorted = sortFlights([flight('a', 300, 60), flight('b', 100, 90)], 'cheapest')
    expect(sorted.map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('orders "fastest" by total duration across slices, not the outbound one', () => {
    // a: short outbound, long return. b: longer outbound, shorter round trip.
    const a = { ...flight('a', 100, 600), durationMin: 300 }
    const b = { ...flight('b', 200, 500), durationMin: 400 }
    expect(sortFlights([a, b], 'fastest').map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('breaks "fastest" ties by price', () => {
    const sorted = sortFlights([flight('a', 300, 60), flight('b', 100, 60)], 'fastest')
    expect(sorted.map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('returns an empty list for every sort key without throwing', () => {
    for (const key of ['best', 'cheapest', 'fastest'] as const) {
      expect(sortFlights([], key)).toEqual([])
    }
  })

  it('does not mutate the input', () => {
    const input = [flight('a', 300, 60), flight('b', 100, 90)]
    sortFlights(input, 'cheapest')
    expect(input.map((f) => f.id)).toEqual(['a', 'b'])
  })
})
