import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../../auth/context'
import type { SearchParams } from '../../types'
import { isSameSearch } from './mapping'
import { createSavedSearch, deleteSavedSearch, listSavedSearches } from './repository'
import type { SavedSearch } from './types'

export const SAVED_SEARCHES_LIMIT = 20

export interface SavedSearchesValue {
  /** Newest first; empty when logged out. */
  items: SavedSearch[]
  loading: boolean
  error: string | null
  /**
   * Saves the search for the current user. Logged out: opens the login dialog
   * and resolves null. An identical saved search is returned instead of a copy.
   */
  save: (params: SearchParams) => Promise<SavedSearch | null>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const SavedSearchesContext = createContext<SavedSearchesValue | null>(null)

/** Shares one saved-search list per signed-in user. Mounted by AuthProvider. */
export function SavedSearchesProvider({ children }: { children: ReactNode }) {
  const { user, openLogin } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const list = await listSavedSearches(SAVED_SEARCHES_LIMIT)
      if (userIdRef.current === userId) setItems(list)
    } catch {
      if (userIdRef.current === userId) setError('Não foi possível carregar suas buscas salvas.')
    } finally {
      if (userIdRef.current === userId) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setItems([])
    setError(null)
    setLoading(false)
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (params: SearchParams) => {
      if (!userId) {
        openLogin()
        return null
      }
      if (!params.departDate) {
        setError('Escolha a data de ida para salvar a busca.')
        return null
      }
      const existing = itemsRef.current.find((saved) => isSameSearch(saved.params, params))
      if (existing) return existing
      try {
        const created = await createSavedSearch(params)
        if (userIdRef.current === userId) {
          setItems((prev) => [created, ...prev].slice(0, SAVED_SEARCHES_LIMIT))
          setError(null)
        }
        return created
      } catch {
        if (userIdRef.current === userId) setError('Não foi possível salvar a busca.')
        return null
      }
    },
    [userId, openLogin],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!userId) return
      const previous = itemsRef.current
      setItems((prev) => prev.filter((saved) => saved.id !== id))
      try {
        await deleteSavedSearch(id)
      } catch {
        if (userIdRef.current === userId) {
          setItems(previous)
          setError('Não foi possível remover a busca.')
        }
      }
    },
    [userId],
  )

  const value = useMemo<SavedSearchesValue>(
    () => ({ items, loading, error, save, remove, refresh }),
    [items, loading, error, save, remove, refresh],
  )

  return <SavedSearchesContext.Provider value={value}>{children}</SavedSearchesContext.Provider>
}

export function useSavedSearches(): SavedSearchesValue {
  const value = useContext(SavedSearchesContext)
  if (!value) throw new Error('useSavedSearches must be used inside <AuthProvider>')
  return value
}
