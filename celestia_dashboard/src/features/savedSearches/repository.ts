import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { SearchParams } from '../../types'
import { fromSavedSearchRow, toSavedSearchInsert } from './mapping'
import type { SavedSearch } from './types'

const TABLE = 'saved_searches'
const COLUMNS =
  'id, origin, destination, depart_date, return_date, trip_type, cabin, adults, children, infants, created_at'

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase
}

/** Current user's saved searches (RLS scopes rows to auth.uid()), newest first. */
export async function listSavedSearches(limit = 20): Promise<SavedSearch[]> {
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
  if (error) throw error
  const saved = fromSavedSearchRow(data)
  if (!saved) throw new Error('Resposta inesperada ao salvar a busca')
  return saved
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await client().from(TABLE).delete().eq('id', id)
  if (error) throw error
}
