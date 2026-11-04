// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import { createFakeSupabase, makeSession } from '../../test/fakeSupabase'
import { AuthProvider } from '../../auth/AuthProvider'
import type { SearchParams } from '../../types'
import { createSavedSearch, listSavedSearches } from './repository'
import type { SavedSearch } from './types'
import { useSavedSearches } from './useSavedSearches'

const mocks = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('../../lib/supabase', () => ({
  get supabase() {
    return mocks.client
  },
  isAuthConfigured: true,
}))

vi.mock('./repository', () => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
}))

const GRU = { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' }
const LIS = { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' }

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    origin: GRU,
    destination: LIS,
    departDate: new Date(2026, 11, 12),
    returnDate: new Date(2026, 11, 19),
    passengers: { adults: 1, children: 0, infants: 0 },
    tripType: 'roundtrip',
    cabin: 'economy',
    ...overrides,
  }
}

function renderSavedSearches() {
  return renderHook(() => useSavedSearches(), { wrapper: AuthProvider })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useSavedSearches logged out', () => {
  it('save() opens the login dialog and does not insert', async () => {
    const fake = createFakeSupabase(null)
    mocks.client = fake
    const { result } = renderSavedSearches()
    await waitFor(() => expect(fake.auth.getSession).toHaveBeenCalled())

    let saved: SavedSearch | null = null
    await act(async () => {
      saved = await result.current.save(params())
    })

    expect(saved).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Entre na sua conta' })).toBeInTheDocument()
    expect(createSavedSearch).not.toHaveBeenCalled()
    expect(fake.from).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
  })
})

describe('useSavedSearches logged in', () => {
  const existing: SavedSearch = { id: 'saved-1', createdAt: '2026-11-04T12:00:00Z', params: params() }

  it('loads the list and returns the existing entry for an identical search', async () => {
    mocks.client = createFakeSupabase(makeSession())
    vi.mocked(listSavedSearches).mockResolvedValue([existing])
    const { result } = renderSavedSearches()
    await waitFor(() => expect(result.current.items).toEqual([existing]))

    let saved: SavedSearch | null = null
    await act(async () => {
      // Fresh Date instances for the same calendar days.
      saved = await result.current.save(params())
    })
    expect(saved).toBe(existing)
    expect(createSavedSearch).not.toHaveBeenCalled()
  })

  it('inserts a new search and puts it first', async () => {
    mocks.client = createFakeSupabase(makeSession())
    vi.mocked(listSavedSearches).mockResolvedValue([existing])
    const business = params({ cabin: 'business' })
    const created: SavedSearch = { id: 'saved-2', createdAt: '2026-11-04T13:00:00Z', params: business }
    vi.mocked(createSavedSearch).mockResolvedValue(created)
    const { result } = renderSavedSearches()
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.save(business)
    })
    expect(createSavedSearch).toHaveBeenCalledWith(business)
    expect(result.current.items.map((s) => s.id)).toEqual(['saved-2', 'saved-1'])
  })
})
