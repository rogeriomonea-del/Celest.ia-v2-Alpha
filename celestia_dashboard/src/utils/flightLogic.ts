import { getDepartureWindow, stopBucket } from '../components/FilterSidebar'
import type { Filters, Flight, SortKey } from '../types'

export function applyFilters(flights: Flight[], filters: Filters): Flight[] {
  return flights.filter((flight) => {
    if (!filters.stops.includes(stopBucket(flight))) return false
    if (!filters.airlines.includes(flight.airline.code)) return false
    if (flight.price > filters.maxPrice) return false
    if (
      filters.departureWindows.length > 0 &&
      !filters.departureWindows.includes(getDepartureWindow(flight.departure.time))
    ) {
      return false
    }
    return true
  })
}

/**
 * "Best" balances price and duration (normalized against the cheapest/fastest
 * options in the set) with a small penalty per stop — the same heuristic
 * family used by metasearch ranking.
 */
function bestScore(flight: Flight, minPrice: number, minDuration: number): number {
  return (
    0.6 * (flight.price / minPrice) +
    0.4 * (flight.durationMin / minDuration) +
    0.08 * flight.stops.length
  )
}

export function sortFlights(flights: Flight[], sortKey: SortKey): Flight[] {
  const sorted = [...flights]
  if (sortKey === 'cheapest') {
    sorted.sort((a, b) => a.price - b.price || a.durationMin - b.durationMin)
  } else if (sortKey === 'fastest') {
    sorted.sort((a, b) => a.durationMin - b.durationMin || a.price - b.price)
  } else {
    const minPrice = Math.min(...flights.map((flight) => flight.price))
    const minDuration = Math.min(...flights.map((flight) => flight.durationMin))
    sorted.sort(
      (a, b) => bestScore(a, minPrice, minDuration) - bestScore(b, minPrice, minDuration),
    )
  }
  return sorted
}
