export interface Airport {
  code: string
  city: string
  name: string
  country: string
  latitude: number
  longitude: number
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
  cabin: CabinClass
  travelDate: string
  departure: { time: string; airportCode: string }
  arrival: { time: string; airportCode: string; dayOffset: number }
  durationMin: number
  stops: FlightStop[]
  /** Total price per passenger, in BRL. */
  price: number
  currency: 'BRL'
  taxesBrl: number
  priceMiles: number | null
  milesProgram: string | null
  seatsLeft: number | null
  tags: FlightTag[]
  baggage: { carryOn: boolean; checkedBags: number } | null
  emissions: 'low' | 'average' | 'high' | null
  strategy: string | null
  fareBrand: string | null
  aircraft: string | null
  scheduleEstimated: boolean
  indicative: boolean
  sourceCode: string
  sourceLabel: string
  /** Link real de reserva (Firecrawl/companhia/Google Flights); null = demo local. */
  bookingUrl: string | null
  /** Milhas equivalentes ao preço, no milheiro do programa do usuário. */
  milesEquivalent: number | null
}

export interface PassengerCounts {
  adults: number
  children: number
  infants: number
}

export type TripType = 'roundtrip' | 'oneway' | 'multicity'
export type CabinClass = 'economy' | 'premium' | 'business'
export type SortKey = 'best' | 'cheapest' | 'fastest'
export type DepartureWindow = 'early' | 'morning' | 'afternoon' | 'evening'
export type SearchMode = 'mock' | 'real'
export type ApiMode = SearchMode | 'off'

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

/** Um trecho da jornada multidestinos (open-jaw é permitido). */
export interface SearchLeg {
  origin: Airport
  destination: Airport
  departDate: Date | null
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
  /** Trechos da jornada — usados somente quando `tripType === 'multicity'`. */
  legs: SearchLeg[]
}

/** Envio discriminado: ou uma busca simples, ou uma jornada de trechos. */
export type SearchSubmission =
  | { kind: 'simple'; params: SearchParams }
  | { kind: 'journey'; params: SearchParams; legs: SearchLeg[] }

export interface Filters {
  /** Stop counts included in the results (0, 1, 2 = "2+"). */
  stops: number[]
  /** Airline codes included in the results. */
  airlines: string[]
  maxPrice: number
  /** Departure time windows; empty array = no time filter. */
  departureWindows: DepartureWindow[]
}

/** Tipos de apresentação. O contrato bruto do motor permanece isolado em api.ts. */
export interface PurchaseStrategy {
  id: string
  strategy: string
  label: string
  cabinFinal: CabinClass
  cashBrl: number
  miles: number
  milheiroBrl: number | null
  effectiveTotalBrl: number
  breakevenMilheiroBrl: number | null
  notes: string[]
}

export interface SearchStats {
  candidatesTotal: number
  candidatesScraped: number
  scrapesSavedByPrefilter: number
  subagentsSpawned: number
  durationSeconds: number
}

export interface PriceQuote {
  route: string
  depart: string
  priceBrl: number
  source: string
}

export interface SearchResult {
  mode: SearchMode
  flights: Flight[]
  strategies: PurchaseStrategy[]
  quotes: PriceQuote[]
  stats: SearchStats
  agentLog: string[]
  lastResort: { bookingUrl: string; reason: string } | null
  /** Número bruto de voos retornados, inclusive sem preço exibível. */
  offersReceived: number
  indicativeOffers: number
}

// ------------------------------------------------- multidestinos (apresentação)
export type LegStatus = 'ok' | 'empty' | 'failed' | 'timeout'

export interface LegError {
  code: string
  message: string
  retriable: boolean
}

/** Resultado de UM trecho: um SearchResult completo + metadados do trecho. */
export interface LegView extends SearchResult {
  legIndex: number
  origin: string
  destination: string
  requestedDepart: string
  status: LegStatus
  error: LegError | null
}

export interface JourneySelection {
  legIndex: number
  flightId: string
  optionKey: string | null
  strategy: string
  bookingUrl: string
}

export interface JourneyItinerary {
  id: string
  rank: number
  priceBasis: 'perPassenger'
  selections: JourneySelection[]
  cashBrl: number
  miles: number
  effectiveTotalBrl: number
  milesShortfall: number
  notes: string[]
}

export interface JourneyStats extends SearchStats {
  legsTotal: number
  legsSucceeded: number
  legsEmpty: number
  legsFailed: number
}

/** Resultado da jornada multidestinos, já mapeado para a apresentação. */
export interface JourneyResult {
  mode: SearchMode
  searchType: 'multiCity'
  pricingScope: 'independentLegs'
  partial: boolean
  legs: LegView[]
  itineraries: JourneyItinerary[]
  stats: JourneyStats
  agentLog: string[]
}
