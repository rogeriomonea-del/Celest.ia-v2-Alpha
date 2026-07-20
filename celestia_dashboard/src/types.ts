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
  /** Link real de reserva (Firecrawl/companhia/Google Flights); ausente = demo. */
  bookingUrl?: string | null
  /** Milhas equivalentes ao preço, no milheiro do programa do usuário. */
  milesEquivalent?: number | null
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

/**
 * Date flexibility presets. The radius (in days) each preset maps to mirrors
 * the engine's `FLEX_PRESETS` (celestia_engine/models.py): 1w=±7, 2w=±14,
 * 3w=±21, 1m=±30. `custom` uses an explicit window instead of a radius.
 */
export type FlexPreset = '1w' | '2w' | '3w' | '1m' | 'custom'

export interface Flexibility {
  enabled: boolean
  preset: FlexPreset
  /** Only used when `preset === 'custom'`: the explicit period to scan. */
  windowStart: Date | null
  windowEnd: Date | null
}

export interface SearchParams {
  origin: Airport
  destination: Airport
  departDate: Date | null
  returnDate: Date | null
  passengers: PassengerCounts
  tripType: TripType
  cabin: CabinClass
  /** When enabled, the engine reads the price calendar and keeps the cheapest
   * dates in the window instead of scraping every date around `departDate`. */
  flexibility: Flexibility
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
