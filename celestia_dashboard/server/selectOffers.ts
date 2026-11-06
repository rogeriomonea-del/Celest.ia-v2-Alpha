/** Trims a mapped result set to what the browser receives. Pure function, no I/O. */
import type { Flight } from '../src/types.js'

export const MAX_OFFERS = 60
export const CHEAPEST_KEPT = 20
export const FASTEST_KEPT = 20
export const PER_STOP_BUCKET_KEPT = 5

const byPrice = (a: Flight, b: Flight) => a.totalPrice - b.totalPrice || a.totalDurationMin - b.totalDurationMin
const byDuration = (a: Flight, b: Flight) => a.totalDurationMin - b.totalDurationMin || a.totalPrice - b.totalPrice

/** Stop bucket of the outbound slice, matching the UI filter: 0, 1, 2 (= "2+"). */
const stopBucket = (flight: Flight) => Math.min(flight.stops.length, 2)

/**
 * Picks up to `max` offers so every sort and filter in the UI still sees its best options:
 * the cheapest, the fastest (total duration), the cheapest few per stop bucket and the
 * cheapest per owner airline, then fills the remaining slots by price. Groups are added in
 * that priority order, so if they alone exceed `max`, the airlines with the most expensive
 * cheapest offer are the ones left out. Returns the selection sorted by total price.
 */
export function selectOffers(flights: Flight[], max = MAX_OFFERS): Flight[] {
  const cheapest = [...flights].sort(byPrice)
  const fastest = [...flights].sort(byDuration)
  const chosen = new Set<Flight>()
  const add = (candidates: Iterable<Flight>) => {
    for (const flight of candidates) {
      if (chosen.size >= max) return
      chosen.add(flight)
    }
  }

  add(cheapest.slice(0, CHEAPEST_KEPT))
  add(fastest.slice(0, FASTEST_KEPT))
  for (const bucket of [0, 1, 2]) {
    add(cheapest.filter((f) => stopBucket(f) === bucket).slice(0, PER_STOP_BUCKET_KEPT))
  }
  const cheapestPerAirline = new Map<string, Flight>()
  for (const flight of cheapest) {
    const key = flight.airline.code || flight.airline.name
    if (!cheapestPerAirline.has(key)) cheapestPerAirline.set(key, flight)
  }
  add(cheapestPerAirline.values())
  add(cheapest)

  return [...chosen].sort(byPrice)
}
