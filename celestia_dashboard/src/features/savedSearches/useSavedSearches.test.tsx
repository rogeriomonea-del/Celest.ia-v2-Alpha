// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import { createFakeSupabase, makeSession } from '../../test/fakeSupabase'
import { AuthProvider } from '../../auth/AuthProvider'
import type { SearchParams } from '../../types'
import { createSavedSearch, listSavedSearches, SavedSearchLimitError } from './repository'
import type { SavedSearch } from './types'
import { useSavedSearches, type SaveResult } from './useSavedSearches'

const mocks = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('../../lib/supabase', () => ({
  get supabase() {
    return mocks.client
  },
  isAuthConfigured: true,
}))

vi.mock('./repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./repository')>()),
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
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
    expect(result.current.loaded).toBe(false)

    let saved: SaveResult | undefined
    await act(async () => {
      saved = await result.current.save(params())
    })

    expect(saved).toEqual({ status: 'login' })
    expect(screen.getByRole('dialog', { name: 'Entre na sua conta' })).toBeInTheDocument()
    expect(createSavedSearch).not.toHaveBeenCalled()
    expect(fake.from).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
  })
})

describe('useSavedSearches logged in', () => {
  const existing: SavedSearch = { id: 'saved-1', createdAt: '2026-11-04T12:00:00Z', params: params() }

  it('loaded is false until the signed-in user’s list has been fetched', async () => {
    mocks.client = createFakeSupabase(makeSession())
    const list = deferred<SavedSearch[]>()
    vi.mocked(listSavedSearches).mockReturnValue(list.promise)
    const { result } = renderSavedSearches()
    await waitFor(() => expect(listSavedSearches).toHaveBeenCalledTimes(1))

    expect(result.current.loaded).toBe(false)
    await act(async () => list.resolve([existing]))
    expect(result.current.loaded).toBe(true)
    expect(result.current.items).toEqual([existing])
  })

  it('loaded is true once the fetch failed, so a save is not held back forever', async () => {
    mocks.client = createFakeSupabase(makeSession())
    vi.mocked(listSavedSearches).mockRejectedValue(new Error('offline'))
    const { result } = renderSavedSearches()
    await waitFor(() => expect(result.current.error).toBe('Não foi possível carregar suas buscas salvas.'))
    expect(result.current.loaded).toBe(true)
  })

  it('loads the list and returns the existing entry for an identical search', async () => {
    mocks.client = createFakeSupabase(makeSession())
    vi.mocked(listSavedSearches).mockResolvedValue([existing])
    const { result } = renderSavedSearches()
    await waitFor(() => expect(result.current.items).toEqual([existing]))

    let saved: SaveResult | undefined
    await act(async () => {
      // Fresh Date instances for the same calendar days.
      saved = await result.current.save(params())
    })
    expect(saved).toEqual({ status: 'saved', saved: existing })
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

    let saved: SaveResult | undefined
    await act(async () => {
      saved = await result.current.save(business)
    })
    expect(createSavedSearch).toHaveBeenCalledWith(business)
    expect(saved).toEqual({ status: 'saved', saved: created })
    expect(result.current.items.map((s) => s.id)).toEqual(['saved-2', 'saved-1'])
  })

  it('save() reports the per-user cap with the pt-BR limit message', async () => {
    mocks.client = createFakeSupabase(makeSession())
    vi.mocked(listSavedSearches).mockResolvedValue([existing])
    vi.mocked(createSavedSearch).mockRejectedValue(new SavedSearchLimitError())
    const { result } = renderSavedSearches()
    await waitFor(() => expect(result.current.loaded).toBe(true))

    let saved: SaveResult | undefined
    await act(async () => {
      saved = await result.current.save(params({ cabin: 'business' }))
    })
    const message = 'Você atingiu o limite de 50 buscas salvas. Remova alguma para salvar outra.'
    expect(saved).toEqual({ status: 'error', message })
    expect(result.current.error).toBe(message)
    expect(result.current.items).toEqual([existing])
  })

  it('save() reports any other failure with the generic message', async () => {
    mocks.client = createFakeSupabase(makeSession())
    vi.mocked(listSavedSearches).mockResolvedValue([])
    vi.mocked(createSavedSearch).mockRejectedValue(new Error('permission denied'))
    const { result } = renderSavedSearches()
    await waitFor(() => expect(result.current.loaded).toBe(true))

    let saved: SaveResult | undefined
    await act(async () => {
      saved = await result.current.save(params())
    })
    const message = 'Não foi possível salvar a busca. Tente novamente.'
    expect(saved).toEqual({ status: 'error', message })
    expect(result.current.error).toBe(message)
  })
})
