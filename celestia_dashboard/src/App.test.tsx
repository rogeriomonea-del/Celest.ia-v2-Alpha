// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { ApiError, fetchOffer, searchFlights } from './lib/api'
import { findAirport } from './data/airports'
import { LATAM, makeFlight, TAP } from './test/flights'
import { addDays, startOfDay } from './utils/dates'
import type { SavedSearch } from './features/savedSearches/types'
import type { SearchParams } from './types'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  saved: [] as { label: string; search: unknown }[],
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
  mocks.saved = []
  vi.mocked(searchFlights).mockResolvedValue({ offers, totalOffers: offers.length, truncated: false, liveMode: true, searchedAt: '2026-11-04T12:00:00Z' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

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
