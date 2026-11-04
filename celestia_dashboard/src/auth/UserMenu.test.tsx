// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createFakeSupabase, makeSession, type FakeSupabase } from '../test/fakeSupabase'
import {
  deleteSavedSearch,
  listSavedSearches,
} from '../features/savedSearches/repository'
import type { SavedSearch } from '../features/savedSearches/types'
import { AuthProvider } from './AuthProvider'
import { UserMenu } from './UserMenu'

const mocks = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return mocks.client
  },
  isAuthConfigured: true,
}))

vi.mock('../features/savedSearches/repository', () => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
}))

const GRU = { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' }
const LIS = { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' }
const GIG = { code: 'GIG', city: 'Rio de Janeiro', name: 'Galeão', country: 'Brasil' }

const lisbonTrip: SavedSearch = {
  id: 'saved-1',
  createdAt: '2026-11-04T12:00:00Z',
  params: {
    origin: GRU,
    destination: LIS,
    departDate: new Date(2026, 11, 12),
    returnDate: new Date(2026, 11, 19),
    passengers: { adults: 1, children: 0, infants: 0 },
    tripType: 'roundtrip',
    cabin: 'economy',
  },
}

const rioTrip: SavedSearch = {
  id: 'saved-2',
  createdAt: '2026-11-03T12:00:00Z',
  params: {
    origin: GRU,
    destination: GIG,
    departDate: new Date(2026, 0, 5),
    returnDate: null,
    passengers: { adults: 2, children: 1, infants: 0 },
    tripType: 'oneway',
    cabin: 'economy',
  },
}

let fake: FakeSupabase

function renderMenu(onSelect = vi.fn()) {
  render(
    <AuthProvider>
      <UserMenu onSelectSavedSearch={onSelect} />
    </AuthProvider>,
  )
  return onSelect
}

beforeEach(() => {
  vi.mocked(listSavedSearches).mockResolvedValue([lisbonTrip, rioTrip])
  vi.mocked(deleteSavedSearch).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UserMenu logged out', () => {
  beforeEach(() => {
    fake = createFakeSupabase(null)
    mocks.client = fake
  })

  it('shows "Entrar", which opens the login dialog', async () => {
    renderMenu()
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('dialog', { name: 'Entre na sua conta' })).toBeInTheDocument()
    expect(listSavedSearches).not.toHaveBeenCalled()
  })
})

describe('UserMenu logged in', () => {
  beforeEach(() => {
    fake = createFakeSupabase(
      makeSession({ email: 'ana@example.com', user_metadata: { full_name: 'Ana Souza' } }),
    )
    mocks.client = fake
  })

  async function openMenu() {
    const trigger = await screen.findByRole('button', { name: 'Minha conta' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveTextContent('AS')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    await within(menu).findByRole('menuitem', { name: 'GRU → LIS · 12 dez – 19 dez · 1 adulto' })
    return { trigger, menu }
  }

  it('shows name, email and the saved searches', async () => {
    renderMenu()
    const { menu } = await openMenu()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(
      within(menu).getByRole('menuitem', { name: 'GRU → GIG · 5 jan · 2 adultos, 1 criança' }),
    ).toBeInTheDocument()
  })

  it('selecting a saved search fires the callback and closes the menu', async () => {
    const onSelect = renderMenu()
    const { trigger, menu } = await openMenu()
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^GRU → LIS/ }))
    expect(onSelect).toHaveBeenCalledWith(lisbonTrip)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('deletes a saved search from its row button', async () => {
    renderMenu()
    const { menu } = await openMenu()
    fireEvent.click(
      within(menu).getByRole('menuitem', {
        name: 'Remover busca salva GRU → LIS · 12 dez – 19 dez · 1 adulto',
      }),
    )
    expect(deleteSavedSearch).toHaveBeenCalledWith('saved-1')
    await waitFor(() =>
      expect(within(menu).queryByRole('menuitem', { name: /^GRU → LIS/ })).not.toBeInTheDocument(),
    )
  })

  it('shows the empty state when nothing is saved', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue([])
    renderMenu()
    fireEvent.click(await screen.findByRole('button', { name: 'Minha conta' }))
    expect(await screen.findByText('Nenhuma busca salva ainda.')).toBeInTheDocument()
  })

  it('"Sair" calls signOut and returns to the logged-out state', async () => {
    renderMenu()
    const { menu } = await openMenu()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }))
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('closes on Escape (focus back on the trigger) and on outside click', async () => {
    renderMenu()
    const { trigger } = await openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
