export interface Airport {
  code: string
  city: string
  name: string
  country: string
}

export interface Airline {
  code: string
  name: string
  /** Tailwind gradient classes used by the placeholder logo. */
  logoGradient: string
}

export interface FlightStop {
  airportCode: string
  city: string
  layoverMin: number
}

export type FlightTag = 'eco' | 'wifi' | 'best-rated' | 'flexible'

export interface Flight {
  id: string
  airline: Airline
  flightNumber: string
  departure: { time: string; airportCode: string }
  arrival: { time: string; airportCode: string; dayOffset: number }
  durationMin: number
  stops: FlightStop[]
  /** Total price per passenger, in BRL. */
  price: number
  currency: 'BRL'
  seatsLeft: number | null
  tags: FlightTag[]
  baggage: { carryOn: boolean; checkedBags: number }
  emissions: 'low' | 'average' | 'high'
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
