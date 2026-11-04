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
})
