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
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SAVED_SEARCHES_LIMIT,
  SavedSearchLimitError,
} from './repository'
import type { SavedSearch } from './types'

const LOAD_FAILED = 'Não foi possível carregar suas buscas salvas.'
const NO_DEPART_DATE = 'Escolha a data de ida para salvar a busca.'
const SAVE_FAILED = 'Não foi possível salvar a busca. Tente novamente.'
const LIMIT_REACHED = `Você atingiu o limite de ${SAVED_SEARCHES_LIMIT} buscas salvas. Remova alguma para salvar outra.`

export type SaveResult =
  /** Saved now, or the identical search that was already saved. */
  | { status: 'saved'; saved: SavedSearch }
  /** Logged out: the login dialog was opened; there is nothing to tell the user. */
  | { status: 'login' }
  /** Not saved; `message` is the pt-BR reason to show next to the save button. */
  | { status: 'error'; message: string }

export interface SavedSearchesValue {
  /** Newest first; empty when logged out. */
  items: SavedSearch[]
  /**
   * True once the signed-in user's list has been fetched (or that fetch failed),
   * so the duplicate check in save() sees what is already stored. False while
   * logged out or while another user's list is still loading.
   */
  loaded: boolean
  loading: boolean
  error: string | null
  /**
   * Saves the search for the current user. Logged out: opens the login dialog.
   * An identical saved search is returned instead of a copy.
   */
  save: (params: SearchParams) => Promise<SaveResult>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const SavedSearchesContext = createContext<SavedSearchesValue | null>(null)

/** Shares one saved-search list per signed-in user. Mounted by AuthProvider. */
export function SavedSearchesProvider({ children }: { children: ReactNode }) {
  const { user, openLogin } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState<SavedSearch[]>([])
  // The user whose list the last fetch settled for; compared with the current user.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
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
      if (userIdRef.current === userId) setError(LOAD_FAILED)
    } finally {
      if (userIdRef.current === userId) {
        setLoading(false)
        setLoadedFor(userId)
      }
    }
  }, [userId])

  useEffect(() => {
    setItems([])
    setLoadedFor(null)
    setError(null)
    setLoading(false)
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (params: SearchParams): Promise<SaveResult> => {
      if (!userId) {
        openLogin()
        return { status: 'login' }
      }
      if (!params.departDate) {
        setError(NO_DEPART_DATE)
        return { status: 'error', message: NO_DEPART_DATE }
      }
      const existing = itemsRef.current.find((saved) => isSameSearch(saved.params, params))
      if (existing) return { status: 'saved', saved: existing }
      try {
        const created = await createSavedSearch(params)
        if (userIdRef.current === userId) {
          setItems((prev) => [created, ...prev].slice(0, SAVED_SEARCHES_LIMIT))
          setError(null)
        }
        return { status: 'saved', saved: created }
      } catch (err) {
        const message = err instanceof SavedSearchLimitError ? LIMIT_REACHED : SAVE_FAILED
        if (userIdRef.current === userId) setError(message)
        return { status: 'error', message }
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

  const loaded = userId !== null && loadedFor === userId
  const value = useMemo<SavedSearchesValue>(
    () => ({ items, loaded, loading, error, save, remove, refresh }),
    [items, loaded, loading, error, save, remove, refresh],
  )

  return <SavedSearchesContext.Provider value={value}>{children}</SavedSearchesContext.Provider>
}

export function useSavedSearches(): SavedSearchesValue {
  const value = useContext(SavedSearchesContext)
  if (!value) throw new Error('useSavedSearches must be used inside <AuthProvider>')
  return value
}
