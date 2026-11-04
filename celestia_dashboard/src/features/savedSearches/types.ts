import type { Airport, CabinClass, SearchParams, TripType } from '../../types'

export interface SavedSearch {
  id: string
  /** ISO timestamp. */
  createdAt: string
  params: SearchParams
}

/** Row of public.saved_searches as selected by the client (user_id omitted). */
export interface SavedSearchRow {
  id: string
  origin: Airport
  destination: Airport
  /** Local calendar date, "YYYY-MM-DD". */
  depart_date: string
  return_date: string | null
  trip_type: TripType
  cabin: CabinClass
  adults: number
  children: number
  infants: number
  created_at: string
}

/** Insert payload; id, user_id and created_at come from column defaults. */
export type SavedSearchInsert = Omit<SavedSearchRow, 'id' | 'created_at'>
