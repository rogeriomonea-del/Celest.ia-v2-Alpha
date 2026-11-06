import { z } from 'zod'
import type { Airport, SearchParams } from '../../types'
import { fromISODate, toISODate } from '../../utils/dates'
import type { SavedSearch, SavedSearchInsert, SavedSearchRow } from './types'

const airportSchema = z.object({
  code: z.string(),
  city: z.string(),
  name: z.string(),
  country: z.string(),
})

const rowSchema = z.object({
  id: z.string(),
  origin: airportSchema,
  destination: airportSchema,
  depart_date: z.string(),
  return_date: z.string().nullable(),
  trip_type: z.enum(['roundtrip', 'oneway']),
  cabin: z.enum(['economy', 'premium', 'business']),
  adults: z.number().int(),
  children: z.number().int(),
  infants: z.number().int(),
  created_at: z.string(),
})

function pickAirport({ code, city, name, country }: Airport): Airport {
  return { code, city, name, country }
}

/** SearchParams -> insert row. Throws when there is no departure date. */
export function toSavedSearchInsert(params: SearchParams): SavedSearchInsert {
  if (!params.departDate) throw new Error('A data de ida é obrigatória')
  const returnDate =
    params.tripType === 'roundtrip' && params.returnDate ? toISODate(params.returnDate) : null
  return {
    origin: pickAirport(params.origin),
    destination: pickAirport(params.destination),
    depart_date: toISODate(params.departDate),
    return_date: returnDate,
    trip_type: params.tripType,
    cabin: params.cabin,
    adults: params.passengers.adults,
    children: params.passengers.children,
    infants: params.passengers.infants,
  }
}

/** Row -> SavedSearch. Returns null for rows that do not match the expected shape. */
export function fromSavedSearchRow(input: unknown): SavedSearch | null {
  const parsed = rowSchema.safeParse(input)
  if (!parsed.success) return null
  const row: SavedSearchRow = parsed.data
  try {
    return {
      id: row.id,
      createdAt: row.created_at,
      params: {
        origin: row.origin,
        destination: row.destination,
        departDate: fromISODate(row.depart_date),
        returnDate: row.return_date ? fromISODate(row.return_date) : null,
        passengers: { adults: row.adults, children: row.children, infants: row.infants },
        tripType: row.trip_type,
        cabin: row.cabin,
      },
    }
  } catch {
    return null
  }
}

/** Same route, dates, passengers, cabin and trip type. */
export function isSameSearch(a: SearchParams, b: SearchParams): boolean {
  const ra = toSavedSearchInsert(a)
  const rb = toSavedSearchInsert(b)
  return (
    ra.origin.code === rb.origin.code &&
    ra.destination.code === rb.destination.code &&
    ra.depart_date === rb.depart_date &&
    ra.return_date === rb.return_date &&
    ra.trip_type === rb.trip_type &&
    ra.cabin === rb.cabin &&
    ra.adults === rb.adults &&
    ra.children === rb.children &&
    ra.infants === rb.infants
  )
}
