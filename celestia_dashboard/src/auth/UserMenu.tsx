import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { LogOut, Trash2 } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { describeSavedSearch } from '../features/savedSearches/format'
import type { SavedSearch } from '../features/savedSearches/types'
import { useSavedSearches } from '../features/savedSearches/useSavedSearches'
import { useAuth } from './context'

export interface UserMenuProps {
  onSelectSavedSearch?: (saved: SavedSearch) => void
}

function metadataString(user: User, key: string): string | null {
  const value: unknown = user.user_metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function displayName(user: User): string | null {
  return metadataString(user, 'full_name') ?? metadataString(user, 'name')
}

function initials(user: User): string {
  const name = displayName(user)
  if (name) {
    const words = name.split(/\s+/)
    const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]
    return letters.toUpperCase()
  }
  return (user.email?.[0] ?? '?').toUpperCase()
}

function Avatar({ user }: { user: User }) {
  const url = metadataString(user, 'avatar_url') ?? metadataString(user, 'picture')
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-9 w-9 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
    >
      {initials(user)}
    </span>
  )
}

const MENU_ITEM = '[role="menuitem"]'

/** "Entrar" when logged out; avatar menu with saved searches when logged in. */
export function UserMenu({ onSelectSavedSearch }: UserMenuProps) {
  const { user, loading, openLogin, signOut } = useAuth()
  const { items, loading: listLoading, error, remove } = useSavedSearches()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const signOutRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const savedHeadingId = useId()

  useClickOutside(containerRef, () => setOpen(false), open)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>(MENU_ITEM)?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Close if the user signs out from elsewhere.
  useEffect(() => {
    if (!user) setOpen(false)
  }, [user])

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key) || !menuRef.current) return
    event.preventDefault()
    const menuItems = Array.from(menuRef.current.querySelectorAll<HTMLElement>(MENU_ITEM))
    if (menuItems.length === 0) return
    const index = menuItems.indexOf(document.activeElement as HTMLElement)
    let next = 0
    if (event.key === 'ArrowDown') next = (index + 1) % menuItems.length
    else if (event.key === 'ArrowUp') next = (index - 1 + menuItems.length) % menuItems.length
    else if (event.key === 'End') next = menuItems.length - 1
    menuItems[next].focus()
  }

  function handleSelect(saved: SavedSearch) {
    setOpen(false)
    triggerRef.current?.focus()
    onSelectSavedSearch?.(saved)
  }

  function handleRemove(saved: SavedSearch, row: HTMLElement | null) {
    // Keep focus inside the menu once the row disappears.
    const sibling =
      row?.nextElementSibling?.querySelector<HTMLElement>(MENU_ITEM) ??
      row?.previousElementSibling?.querySelector<HTMLElement>(MENU_ITEM) ??
      signOutRef.current
    sibling?.focus()
    void remove(saved.id)
  }

  function handleSignOut() {
    setOpen(false)
    void signOut()
  }

  if (loading) {
    return <span aria-hidden="true" className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={openLogin}
        className="rounded-full px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Entrar
      </button>
    )
  }

  const name = displayName(user)

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Minha conta"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition-shadow hover:ring-2 hover:ring-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Avatar user={user} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
          <div className="border-b border-slate-100 px-4 pb-3 pt-1">
            {name && <p className="truncate text-sm font-semibold text-slate-900">{name}</p>}
            {user.email && <p className="truncate text-sm text-slate-500">{user.email}</p>}
          </div>

          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Minha conta"
            onKeyDown={handleMenuKeyDown}
          >
            <div role="group" aria-labelledby={savedHeadingId} className="py-2">
              <p
                id={savedHeadingId}
                className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Buscas salvas
              </p>
              {listLoading && items.length === 0 && (
                <p className="px-4 py-2 text-sm text-slate-500">Carregando…</p>
              )}
              {!listLoading && items.length === 0 && !error && (
                <p className="px-4 py-2 text-sm text-slate-500">Nenhuma busca salva ainda.</p>
              )}
              {error && <p className="px-4 py-2 text-sm text-red-700">{error}</p>}
              {items.map((saved) => {
                const label = describeSavedSearch(saved.params)
                return (
                  <div key={saved.id} role="none" className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => handleSelect(saved)}
                      className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      aria-label={`Remover busca salva ${label}`}
                      onClick={(event) => handleRemove(saved, event.currentTarget.parentElement)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 focus:bg-red-50 focus:text-red-600 focus:outline-none"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div role="separator" className="my-1 border-t border-slate-100" />
            <div role="none" className="px-2">
              <button
                ref={signOutRef}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
