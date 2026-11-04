export interface Airport {
  code: string
  city: string
  name: string
  country: string
}

export interface Airline {
  /** IATA carrier code, e.g. "LA". */
  code: string
  name: string
  /** Tailwind gradient classes used when no logo image is available. */
  logoGradient: string
  /** Carrier logo (square symbol) from the flight provider, if any. */
  logoUrl: string | null
}

export interface FlightStop {
  airportCode: string
  city: string
  layoverMin: number
}

export type FlightTag = 'eco' | 'wifi' | 'best-rated' | 'flexible'

export interface FlightSegment {
  carrier: Airline
  /** e.g. "LA 8084" */
  flightNumber: string
  originCode: string
  destinationCode: string
  /** Local date-time at the airport, ISO without offset: "2026-12-01T22:05:00". */
  departingAt: string
  arrivingAt: string
  durationMin: number
  aircraft: string | null
}

/** One direction of travel (outbound or return). */
export interface FlightSlice {
  departure: { time: string; airportCode: string; date: string }
  arrival: { time: string; airportCode: string; dayOffset: number }
  durationMin: number
  stops: FlightStop[]
  segments: FlightSegment[]
}

/**
 * A bookable offer. The top-level departure/arrival/durationMin/stops mirror
 * the OUTBOUND slice (slices[0]) so cards, filters and sorting can read them
 * directly; `slices` carries every direction.
 */
export interface Flight {
  /** Provider offer id (e.g. Duffel "off_..."). */
  id: string
  /** Owner airline of the offer. */
  airline: Airline
  flightNumber: string
  departure: { time: string; airportCode: string }
  arrival: { time: string; airportCode: string; dayOffset: number }
  /** Outbound slice duration. */
  durationMin: number
  /** Sum of all slice durations (used for "fastest"/"best" sorting). */
  totalDurationMin: number
  stops: FlightStop[]
  slices: FlightSlice[]
  /** Price per passenger (totalPrice / passenger count), in `currency`. */
  price: number
  /** Total price for all passengers, in `currency`. */
  totalPrice: number
  /** ISO 4217 code, e.g. "BRL", "USD". */
  currency: string
  seatsLeft: number | null
  tags: FlightTag[]
  baggage: { carryOn: boolean; checkedBags: number }
  /** Relative to the other offers in the same result set. */
  emissions: 'low' | 'average' | 'high'
  emissionsKg: number | null
  /** ISO timestamp after which the offer can no longer be booked. */
  expiresAt: string
  conditions: { refundable: boolean | null; changeable: boolean | null }
}

export interface PassengerCounts {
  adults: number
  children: number
  infants: number
}

export type TripType = 'roundtrip' | 'oneway'
export type CabinClass = 'economy' | 'premium' | 'business'
export type SortKey = 'best' | 'cheapest' | 'fastest'
export type DepartureWindow = 'early' | 'morning' | 'afternoon' | 'evening'

export interface SearchParams {
  origin: Airport
  destination: Airport
  departDate: Date | null
  returnDate: Date | null
  passengers: PassengerCounts
  tripType: TripType
  cabin: CabinClass
}

export interface Filters {
  /** Stop counts included in the results (0, 1, 2 = "2+"). */
  stops: number[]
  /** Airline codes included in the results. */
  airlines: string[]
  maxPrice: number
  /** Departure time windows; empty array = no time filter. */
  departureWindows: DepartureWindow[]
}
