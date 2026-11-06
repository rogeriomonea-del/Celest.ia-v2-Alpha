import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchParams } from '../../types'
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SavedSearchLimitError,
} from './repository'
import { toSavedSearchInsert } from './mapping'

type Result = { data: unknown; error: unknown }

const mocks = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: { data: null, error: null } as { data: unknown; error: unknown },
  from: null as unknown,
}))

vi.mock('../../lib/supabase', () => ({
  get supabase() {
    return { from: mocks.from }
  },
  isAuthConfigured: true,
}))

/** Thenable query builder that records the chained calls. */
function builder(result: Result) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'order', 'limit', 'insert', 'delete', 'eq', 'single']) {
    chain[method] = (...args: unknown[]) => {
      mocks.calls.push([method, ...args])
      return chain
    }
  }
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return chain
}

const GRU = { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' }
const LIS = { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' }
const params: SearchParams = {
  origin: GRU,
  destination: LIS,
  departDate: new Date(2026, 11, 12),
  returnDate: null,
  passengers: { adults: 1, children: 0, infants: 0 },
  tripType: 'oneway',
  cabin: 'economy',
}
const row = { id: 'saved-1', created_at: '2026-11-04T12:00:00Z', ...toSavedSearchInsert(params) }

beforeEach(() => {
  mocks.calls = []
  mocks.result = { data: null, error: null }
  mocks.from = vi.fn((table: string) => {
    mocks.calls.push(['from', table])
    return builder(mocks.result)
  })
})

describe('saved searches repository', () => {
  it('lists the newest 50 rows of saved_searches (the server-side cap)', async () => {
    mocks.result = { data: [row], error: null }
    const list = await listSavedSearches()
    expect(list.map((s) => s.id)).toEqual(['saved-1'])
    expect(mocks.calls[0]).toEqual(['from', 'saved_searches'])
    expect(mocks.calls).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(mocks.calls).toContainEqual(['limit', 50])
  })

  it('inserts the mapped row without a user_id (the column defaults to auth.uid())', async () => {
    mocks.result = { data: row, error: null }
    const saved = await createSavedSearch(params)
    expect(saved.id).toBe('saved-1')
    const insert = mocks.calls.find((call) => call[0] === 'insert')
    expect(insert?.[1]).toEqual(toSavedSearchInsert(params))
    expect(insert?.[1]).not.toHaveProperty('user_id')
  })

  it('deletes by id', async () => {
    await deleteSavedSearch('saved-1')
    expect(mocks.calls).toEqual([['from', 'saved_searches'], ['delete'], ['eq', 'id', 'saved-1']])
  })

  it('throws Supabase errors', async () => {
    mocks.result = { data: null, error: new Error('permission denied') }
    await expect(listSavedSearches()).rejects.toThrow('permission denied')
  })

  it('throws SavedSearchLimitError when the per-user cap trigger rejects the insert', async () => {
    // migration 20261105000000_saved_searches_constraints.sql raises check_violation (23514).
    mocks.result = {
      data: null,
      error: { code: '23514', message: 'saved_searches limit reached (50 per user)', details: null, hint: null },
    }
    await expect(createSavedSearch(params)).rejects.toBeInstanceOf(SavedSearchLimitError)
  })

  it('rethrows other check violations unchanged', async () => {
    const error = {
      code: '23514',
      message: 'new row for relation "saved_searches" violates check constraint "saved_searches_max_seated"',
      details: null,
      hint: null,
    }
    mocks.result = { data: null, error }
    await expect(createSavedSearch(params)).rejects.toBe(error)
  })
})
