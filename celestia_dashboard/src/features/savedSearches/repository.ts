import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { SearchParams } from '../../types'
import { fromSavedSearchRow, toSavedSearchInsert } from './mapping'
import type { SavedSearch } from './types'

const TABLE = 'saved_searches'
const COLUMNS =
  'id, origin, destination, depart_date, return_date, trip_type, cabin, adults, children, infants, created_at'

/**
 * Rows per user, enforced server-side by the saved_searches_enforce_limit trigger
 * (migration 20261105000000_saved_searches_constraints.sql). Listing the same number
 * keeps the whole list visible and the in-memory duplicate check complete.
 */
export const SAVED_SEARCHES_LIMIT = 50

/** Thrown by createSavedSearch when the user already has SAVED_SEARCHES_LIMIT rows. */
export class SavedSearchLimitError extends Error {
  constructor() {
    super(`saved_searches limit reached (${SAVED_SEARCHES_LIMIT} per user)`)
    this.name = 'SavedSearchLimitError'
  }
}

/** The cap trigger raises check_violation (23514) with a 'limit reached' message. */
function isLimitError(error: PostgrestError): boolean {
  return error.code === '23514' && /limit reached/.test(error.message)
}

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase
}

/** Current user's saved searches (RLS scopes rows to auth.uid()), newest first. */
export async function listSavedSearches(limit = SAVED_SEARCHES_LIMIT): Promise<SavedSearch[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(fromSavedSearchRow).filter((s): s is SavedSearch => s !== null)
}

export async function createSavedSearch(params: SearchParams): Promise<SavedSearch> {
  const { data, error } = await client()
    .from(TABLE)
    .insert(toSavedSearchInsert(params))
    .select(COLUMNS)
    .single()
  if (error) throw isLimitError(error) ? new SavedSearchLimitError() : error
  const saved = fromSavedSearchRow(data)
  if (!saved) throw new Error('Resposta inesperada ao salvar a busca')
  return saved
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await client().from(TABLE).delete().eq('id', id)
  if (error) throw error
}
