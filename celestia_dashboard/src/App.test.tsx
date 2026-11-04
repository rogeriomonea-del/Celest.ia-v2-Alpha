// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App, { PENDING_SAVE_KEY } from './App'
import { ApiError, fetchOffer, searchFlights } from './lib/api'
import { findAirport } from './data/airports'
import { LATAM, makeFlight, TAP } from './test/flights'
import { addDays, startOfDay, toISODate } from './utils/dates'
import type { SavedSearch } from './features/savedSearches/types'
import type { SearchParams } from './types'

const mocks = vi.hoisted(() => ({
  loginOpen: false,
  save: vi.fn(),
  saved: [] as { label: string; search: unknown }[],
  user: null as { id: string } | null,
}))

vi.mock('./auth/context', () => ({
  useAuth: () => ({ user: mocks.user, loginOpen: mocks.loginOpen }),
}))

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/api')>()),
  searchFlights: vi.fn(),
  fetchOffer: vi.fn(),
  fetchPlaces: vi.fn(() => new Promise(() => {})),
}))

vi.mock('./features/savedSearches/useSavedSearches', () => ({
  useSavedSearches: () => ({ save: mocks.save }),
}))

// The real Header needs auth; this one just exposes the saved-search callback.
vi.mock('./components/Header', () => ({
  Header: ({ onSelectSavedSearch }: { onSelectSavedSearch: (saved: unknown) => void }) => (
    <header>
      {mocks.saved.map(({ label, search }) => (
        <button key={label} type="button" onClick={() => onSelectSavedSearch(search)}>
          {label}
        </button>
      ))}
    </header>
  ),
}))

const offers = [
  makeFlight({ id: 'off_la', airline: LATAM, price: 3500, totalPrice: 3500 }),
  makeFlight({ id: 'off_tp', airline: TAP, flightNumber: 'TP 82', price: 4200, totalPrice: 4200 }),
]

function savedSearch(id: string, departInDays: number): SavedSearch {
  const today = startOfDay(new Date())
  return {
    id,
    createdAt: '2026-11-01T12:00:00Z',
    params: {
      origin: findAirport('GIG'),
      destination: findAirport('MAD'),
      departDate: addDays(today, departInDays),
      returnDate: addDays(today, departInDays + 7),
      passengers: { adults: 2, children: 0, infants: 0 },
      tripType: 'roundtrip',
      cabin: 'premium',
    },
  }
}

const searchButton = () => screen.getByRole('button', { name: 'Buscar voos' })
const offerButtons = () => screen.queryAllByRole('button', { name: 'Ver oferta' })

async function searchAndWait() {
  fireEvent.click(searchButton())
  await screen.findByRole('tablist', { name: 'Ordenar resultados' })
}

beforeEach(() => {
  mocks.loginOpen = false
  mocks.saved = []
  mocks.user = null
  window.sessionStorage.clear()
  vi.mocked(searchFlights).mockResolvedValue({ offers, totalOffers: offers.length, truncated: false, liveMode: true, searchedAt: '2026-11-04T12:00:00Z' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('App search flow', () => {
  it('starts idle and does not search on load', () => {
    render(<App />)
    expect(screen.getByText('Pronto para buscar')).toBeInTheDocument()
    expect(screen.getByText(/nenhuma busca ainda/)).toBeInTheDocument()
    expect(searchFlights).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Salvar busca' })).toBeDisabled()
  })

  it('searches with the form params and renders one card per offer', async () => {
    render(<App />)
    await searchAndWait()

    expect(searchFlights).toHaveBeenCalledTimes(1)
    const [params, signal] = vi.mocked(searchFlights).mock.calls[0]
    expect(params).toMatchObject({
      origin: { code: 'GRU' },
      destination: { code: 'LIS' },
      tripType: 'roundtrip',
      cabin: 'economy',
      passengers: { adults: 1, children: 0, infants: 0 },
    })
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(offerButtons()).toHaveLength(2)
    expect(screen.getByText('LATAM · LA 8084')).toBeInTheDocument()
    expect(screen.getByText('TAP Air Portugal · TP 82')).toBeInTheDocument()
    expect(screen.getByText(/2 de 2 voos/)).toBeInTheDocument()
    expect(screen.queryByText('Pronto para buscar')).not.toBeInTheDocument()
  })

  it('shows the API error and "Tentar novamente" re-runs the same search', async () => {
    vi.mocked(searchFlights).mockRejectedValueOnce(
      new ApiError('provider_error', 'O provedor de voos está indisponível.', 502),
    )
    render(<App />)
    fireEvent.click(searchButton())

    expect(await screen.findByText('Não foi possível concluir a busca')).toBeInTheDocument()
    expect(screen.getByText('O provedor de voos está indisponível.')).toBeInTheDocument()
    expect(offerButtons()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await screen.findByRole('tablist', { name: 'Ordenar resultados' })
    expect(searchFlights).toHaveBeenCalledTimes(2)
    const [first, second] = vi.mocked(searchFlights).mock.calls
    expect(second[0]).toEqual(first[0])
    expect(offerButtons()).toHaveLength(2)
  })

  it('shows the zero-offers state', async () => {
    vi.mocked(searchFlights).mockResolvedValue({ offers: [], totalOffers: 0, truncated: false, liveMode: true, searchedAt: '2026-11-04T12:00:00Z' })
    render(<App />)
    fireEvent.click(searchButton())

    expect(await screen.findByText('Nenhuma oferta para esta busca')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(offerButtons()).toHaveLength(0)
  })

  it('shows the filters-empty state and "Limpar filtros" restores the results', async () => {
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('checkbox', { name: /LATAM/ }))
    expect(offerButtons()).toHaveLength(1)
    fireEvent.click(screen.getByRole('checkbox', { name: /TAP Air Portugal/ }))

    expect(screen.getByText('Nenhum voo corresponde aos filtros')).toBeInTheDocument()
    expect(offerButtons()).toHaveLength(0)
    expect(screen.getByText(/0 de 2 voos/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))

    expect(offerButtons()).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: /LATAM/ })).toBeChecked()
  })

  it('"Ver oferta" opens the dialog, which re-fetches that offer', async () => {
    vi.mocked(fetchOffer).mockReturnValue(new Promise(() => {}))
    render(<App />)
    await searchAndWait()

    fireEvent.click(offerButtons()[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(fetchOffer).toHaveBeenCalledWith('off_la', expect.any(AbortSignal))
  })
})

describe('App result status', () => {
  it('says how many offers are shown when the server truncated the results', async () => {
    vi.mocked(searchFlights).mockResolvedValue({ offers, totalOffers: 57, truncated: true, liveMode: true, searchedAt: '2026-11-04T12:00:00Z' })
    render(<App />)
    await searchAndWait()
    expect(screen.getByText(/Mostrando 2 de 57 ofertas/)).toBeInTheDocument()
  })

  it('does not mention truncation when every offer is shown', async () => {
    render(<App />)
    await searchAndWait()
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })

  it('shows the test-mode banner when the provider is not live', async () => {
    vi.mocked(searchFlights).mockResolvedValue({ offers, totalOffers: 2, truncated: false, liveMode: false, searchedAt: '2026-11-04T12:00:00Z' })
    render(<App />)
    await searchAndWait()
    expect(screen.getByRole('note')).toHaveTextContent('Modo de teste: preços fictícios, apenas para demonstração.')
    expect(screen.queryByText(/tarifas reais/i)).not.toBeInTheDocument()
  })

  it('has no test-mode banner in live mode, and never claims "Tarifas reais"', async () => {
    render(<App />)
    expect(screen.queryByText(/tarifas reais/i)).not.toBeInTheDocument()
    await searchAndWait()
    expect(screen.queryByText(/Modo de teste/)).not.toBeInTheDocument()
    expect(screen.queryByText(/tarifas reais/i)).not.toBeInTheDocument()
  })
})

describe('App saved searches', () => {
  it('"Salvar busca" saves the searched params', async () => {
    mocks.save.mockResolvedValue({ id: 'saved-9' })
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))

    const searched = vi.mocked(searchFlights).mock.calls[0][0]
    expect(mocks.save).toHaveBeenCalledWith(searched)
    expect(await screen.findByRole('button', { name: 'Busca salva' })).toBeDisabled()
  })

  it('keeps "Salvar busca" available when saving did not happen (e.g. logged out)', async () => {
    mocks.save.mockResolvedValue(null)
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))

    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Salvar busca' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an inline error when saving fails while logged in', async () => {
    mocks.user = { id: 'user-1' }
    mocks.save.mockResolvedValue(null)
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar a busca. Tente novamente.')
    expect(screen.getByRole('button', { name: 'Salvar busca' })).toBeEnabled()
  })

  it('does not mark a new search as saved when an earlier save resolves late', async () => {
    mocks.user = { id: 'user-1' }
    const pending = deferred<{ id: string } | null>()
    mocks.save.mockReturnValue(pending.promise)
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))
    fireEvent.click(searchButton())
    await act(async () => pending.resolve({ id: 'saved-old' }))

    expect(screen.getByRole('button', { name: 'Salvar busca' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Busca salva' })).not.toBeInTheDocument()
  })

  it('a saved search with a past date clears the dates and shows a hint without searching', () => {
    const past = savedSearch('saved-old', -3)
    mocks.saved = [{ label: 'Abrir busca antiga', search: past }]
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir busca antiga' }))

    expect(
      screen.getByText('As datas desta busca já passaram. Escolha novas datas e busque novamente.'),
    ).toBeInTheDocument()
    expect(searchFlights).not.toHaveBeenCalled()
    // The form now holds the saved route with no dates, so it cannot search yet.
    expect(screen.getByRole('combobox', { name: 'Origem' })).toHaveValue('Rio de Janeiro (GIG)')
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('Madri (MAD)')
    expect(searchButton()).toBeDisabled()
    expect(screen.getByText('Pronto para buscar')).toBeInTheDocument()
  })

  it('a saved search with a future date runs it right away', async () => {
    const upcoming = savedSearch('saved-new', 10)
    mocks.saved = [{ label: 'Abrir busca futura', search: upcoming }]
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir busca futura' }))

    await screen.findByRole('tablist', { name: 'Ordenar resultados' })
    expect(searchFlights).toHaveBeenCalledWith(upcoming.params satisfies SearchParams, expect.any(AbortSignal))
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('Madri (MAD)')
  })
})

describe('App pending save across the login redirect', () => {
  const stored = (departInDays: number) => {
    const today = startOfDay(new Date())
    return {
      origin: findAirport('GIG'),
      destination: findAirport('MAD'),
      departDate: toISODate(addDays(today, departInDays)),
      returnDate: toISODate(addDays(today, departInDays + 7)),
      passengers: { adults: 2, children: 0, infants: 0 },
      tripType: 'roundtrip',
      cabin: 'premium',
    }
  }

  it('logged out: keeps the searched params in sessionStorage before opening login', async () => {
    mocks.save.mockImplementation(async () => {
      // save() opens the login; the params must already be stored by then.
      expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).not.toBeNull()
      return null
    })
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))

    const searched = vi.mocked(searchFlights).mock.calls[0][0]
    expect(JSON.parse(window.sessionStorage.getItem(PENDING_SAVE_KEY)!)).toEqual({
      origin: searched.origin,
      destination: searched.destination,
      departDate: toISODate(searched.departDate!),
      returnDate: toISODate(searched.returnDate!),
      passengers: searched.passengers,
      tripType: 'roundtrip',
      cabin: 'economy',
    })
  })

  it('logged in: does not store a pending save', async () => {
    mocks.user = { id: 'user-1' }
    mocks.save.mockResolvedValue({ id: 'saved-1' })
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))

    await screen.findByRole('button', { name: 'Busca salva' })
    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).toBeNull()
  })

  it('once logged in, restores the pending search, runs it and saves it', async () => {
    window.sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(stored(10)))
    mocks.save.mockResolvedValue({ id: 'saved-2' })
    const { rerender } = render(<App />)

    // Still logged out (e.g. the session is loading): nothing is consumed.
    expect(searchFlights).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).not.toBeNull()

    mocks.user = { id: 'user-1' }
    rerender(<App />)

    expect(await screen.findByRole('button', { name: 'Busca salva' })).toBeDisabled()
    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).toBeNull()
    const today = startOfDay(new Date())
    const expected: SearchParams = {
      origin: findAirport('GIG'),
      destination: findAirport('MAD'),
      departDate: addDays(today, 10),
      returnDate: addDays(today, 17),
      passengers: { adults: 2, children: 0, infants: 0 },
      tripType: 'roundtrip',
      cabin: 'premium',
    }
    expect(searchFlights).toHaveBeenCalledTimes(1)
    expect(searchFlights).toHaveBeenCalledWith(expected, expect.any(AbortSignal))
    expect(mocks.save).toHaveBeenCalledWith(expected)
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('Madri (MAD)')
  })

  it('closing the login dialog without signing in drops the pending save', () => {
    window.sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(stored(10)))
    mocks.loginOpen = true
    const { rerender } = render(<App />)
    mocks.loginOpen = false
    rerender(<App />)
    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).toBeNull()

    // A later sign-in must not replay the abandoned search or save it.
    mocks.user = { id: 'user-1' }
    rerender(<App />)
    expect(searchFlights).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('running a different search drops the pending save', async () => {
    window.sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(stored(10)))
    render(<App />)
    await searchAndWait()
    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).toBeNull()
  })

  it('a pending search whose date has passed only restores the route and shows the hint', () => {
    window.sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(stored(-2)))
    mocks.user = { id: 'user-1' }
    render(<App />)

    expect(
      screen.getByText('As datas desta busca já passaram. Escolha novas datas e busque novamente.'),
    ).toBeInTheDocument()
    expect(searchFlights).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Origem' })).toHaveValue('Rio de Janeiro (GIG)')
    expect(searchButton()).toBeDisabled()
  })

  it('ignores and removes a corrupt pending save', () => {
    window.sessionStorage.setItem(PENDING_SAVE_KEY, '{"origin":')
    mocks.user = { id: 'user-1' }
    render(<App />)

    expect(window.sessionStorage.getItem(PENDING_SAVE_KEY)).toBeNull()
    expect(searchFlights).not.toHaveBeenCalled()
    expect(screen.getByText('Pronto para buscar')).toBeInTheDocument()
  })

  it('keeps working when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    mocks.save.mockResolvedValue(null)
    render(<App />)
    await searchAndWait()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar busca' }))

    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    mocks.user = { id: 'user-1' }
    cleanup()
    render(<App />)
    expect(screen.getByText('Pronto para buscar')).toBeInTheDocument()
  })
})
