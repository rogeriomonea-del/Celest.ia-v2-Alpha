import type { Airline, Flight, FlightMiles, FlightSlice } from '../types'

export const LATAM: Airline = {
  code: 'LA',
  name: 'LATAM',
  logoGradient: 'from-red-600 to-rose-700',
  logoUrl: null,
}

export const TAP: Airline = {
  code: 'TP',
  name: 'TAP Air Portugal',
  logoGradient: 'from-emerald-600 to-green-700',
  logoUrl: null,
}

export function makeSlice(overrides: Partial<FlightSlice> = {}): FlightSlice {
  return {
    departure: { time: '22:05', airportCode: 'GRU', date: '2026-12-01' },
    arrival: { time: '11:30', airportCode: 'LIS', dayOffset: 1 },
    durationMin: 565,
    stops: [],
    segments: [
      {
        carrier: LATAM,
        flightNumber: 'LA 8084',
        originCode: 'GRU',
        destinationCode: 'LIS',
        departingAt: '2026-12-01T22:05:00',
        arrivingAt: '2026-12-02T11:30:00',
        durationMin: 565,
        aircraft: 'Boeing 787-9',
      },
    ],
    ...overrides,
  }
}

/** A one-way, direct, single-passenger offer in BRL; override what a test needs. */
export function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: 'off_1',
    airline: LATAM,
    flightNumber: 'LA 8084',
    departure: { time: '22:05', airportCode: 'GRU' },
    arrival: { time: '11:30', airportCode: 'LIS', dayOffset: 1 },
    durationMin: 565,
    totalDurationMin: 565,
    stops: [],
    slices: [makeSlice()],
    price: 3500,
    totalPrice: 3500,
    currency: 'BRL',
    seatsLeft: null,
    tags: [],
    baggage: { carryOn: true, checkedBags: 0 },
    emissions: 'average',
    emissionsKg: null,
    expiresAt: '2026-12-01T15:30:00Z',
    conditions: { refundable: null, changeable: null, refundPenalty: null, changePenalty: null },
    miles: null,
    ...overrides,
  }
}

/** Miles module for a R$ 3.500 fare at milheiro R$ 29 (LATAM Pass), with a cheaper Smiles award. */
export function makeMiles(overrides: Partial<FlightMiles> = {}): FlightMiles {
  return {
    equivalentMiles: 120690,
    award: {
      program: 'smiles',
      programName: 'Smiles',
      cabin: 'economy',
      miles: 60000,
      taxes: { amount: 180, currency: 'BRL' },
      seatsLeft: 4,
      direct: true,
      flightNumbers: ['LA 8084'],
      matchesItinerary: true,
      source: 'seats_aero',
      fetchedAt: '2026-11-04T12:00:00Z',
      bookingUrl: null,
    },
    options: [
      {
        strategy: 'award',
        label: 'Emissão em milhas (Smiles)',
        cabin: 'economy',
        cash: { amount: 180, currency: 'BRL' },
        miles: 60000,
        program: 'smiles',
        milheiroBrl: 29,
        effectiveTotalBrl: 1920,
        breakevenMilheiroBrl: 55.33,
        notes: ['Saldo insuficiente: faltam 10.000 milhas'],
      },
      {
        strategy: 'cash',
        label: 'Passagem em dinheiro',
        cabin: 'economy',
        cash: { amount: 3500, currency: 'BRL' },
        miles: 0,
        program: null,
        // Like the server's calculator: the cash option spends no miles, so it carries no milheiro.
        milheiroBrl: null,
        effectiveTotalBrl: 3500,
        breakevenMilheiroBrl: null,
        notes: [],
      },
    ],
    ...overrides,
  }
}
