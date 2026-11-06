// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OfferDialog } from './OfferDialog'
import { ApiError, fetchOffer, UNREACHABLE_MESSAGE } from '../lib/api'
import { makeFlight, makeMiles } from '../test/flights'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  fetchOffer: vi.fn(),
}))

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

const searched = makeFlight({ id: 'off_42', price: 3500, totalPrice: 7000 })

function renderDialog(props: { onClose?: () => void; onResearch?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onResearch = props.onResearch ?? vi.fn()
  render(<OfferDialog flight={searched} passengerCount={2} milheiro={29} onClose={onClose} onResearch={onResearch} />)
  return { onClose, onResearch }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('OfferDialog', () => {
  it('re-fetches the offer and shows the current price and conditions', async () => {
    vi.mocked(fetchOffer).mockResolvedValue({
      ...searched,
      conditions: { refundable: false, changeable: true, refundPenalty: null, changePenalty: null },
    })
    renderDialog()

    expect(screen.getByText('Confirmando preço e disponibilidade…')).toBeInTheDocument()
    expect(fetchOffer).toHaveBeenCalledWith('off_42', expect.any(AbortSignal))
    const total = await screen.findByText(/total · 2 passageiros/)
    expect(plain(total.parentElement!.textContent)).toBe('R$ 7.000total · 2 passageiros')
    expect(plain(screen.getByText(/por pessoa/).textContent)).toBe('R$ 3.500 por pessoa')
    expect(screen.queryByText(/O preço mudou/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Válida até/)).toBeInTheDocument()
    expect(screen.getByText('Não reembolsável')).toBeInTheDocument()
    expect(screen.getByText('Remarcável (taxa a confirmar)')).toBeInTheDocument()
  })

  it('keeps the emissions bucket from the search results, not the single re-fetched offer', async () => {
    const card = makeFlight({ id: 'off_7', emissions: 'high', emissionsKg: 980 })
    // Alone, the re-fetched offer is always "average" relative to itself.
    vi.mocked(fetchOffer).mockResolvedValue({ ...card, emissions: 'average' })
    render(<OfferDialog flight={card} passengerCount={1} milheiro={29} onClose={vi.fn()} onResearch={vi.fn()} />)

    const line = await screen.findByText(/Emissões/)
    expect(plain(line.textContent)).toBe('Emissões acima da média · 980 kg CO₂')
  })

  it('does not report a price change that is invisible once formatted (BRL has no cents)', async () => {
    vi.mocked(fetchOffer).mockResolvedValue({ ...searched, price: 3500.2, totalPrice: 7000.4 })
    renderDialog()

    await screen.findByText(/total · 2 passageiros/)
    expect(screen.queryByText(/O preço mudou/)).not.toBeInTheDocument()
  })

  it('reports a currency change even for the same amount', async () => {
    vi.mocked(fetchOffer).mockResolvedValue({ ...searched, currency: 'USD' })
    renderDialog()

    const changed = await screen.findByText(/O preço mudou/)
    expect(plain(changed.textContent)).toBe('O preço mudou desde a busca (antes R$ 7.000).')
  })

  it('shows the refreshed price and "O preço mudou" when it differs from the search', async () => {
    vi.mocked(fetchOffer).mockResolvedValue({ ...searched, price: 3800, totalPrice: 7600 })
    renderDialog()

    const changed = await screen.findByText(/O preço mudou/)
    expect(plain(changed.textContent)).toBe('O preço mudou desde a busca (antes R$ 7.000).')
    expect(plain(screen.getByText(/total · 2 passageiros/).parentElement!.textContent)).toContain('R$ 7.600')
  })

  it('offer_expired shows "Refazer busca", which triggers the re-search callback', async () => {
    vi.mocked(fetchOffer).mockRejectedValue(new ApiError('offer_expired', 'Oferta expirada', 410))
    const { onResearch } = renderDialog()

    expect(await screen.findByText('Esta oferta expirou')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refazer busca' }))
    expect(onResearch).toHaveBeenCalledTimes(1)
  })

  it('shows the API message for other errors', async () => {
    vi.mocked(fetchOffer).mockRejectedValue(new ApiError('provider_error', 'Companhia indisponível', 502))
    renderDialog()
    expect(await screen.findByText('Companhia indisponível')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refazer busca' })).not.toBeInTheDocument()
  })

  it('shows the friendly message for a non-API failure', async () => {
    vi.mocked(fetchOffer).mockRejectedValue(new Error('boom'))
    renderDialog()
    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeInTheDocument()
  })

  it('moves focus into the dialog and closes on Escape, restoring focus to the opener', async () => {
    vi.mocked(fetchOffer).mockReturnValue(new Promise(() => {}))
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()

    renderDialog({ onClose })

    const dialog = screen.getByRole('dialog', { name: 'LATAM · GRU → LIS' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    cleanup()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('aborts the offer request when closed', () => {
    vi.mocked(fetchOffer).mockReturnValue(new Promise(() => {}))
    renderDialog()
    const signal = vi.mocked(fetchOffer).mock.calls[0][1]!
    expect(signal.aborted).toBe(false)
    cleanup()
    expect(signal.aborted).toBe(true)
  })
})

describe('OfferDialog miles', () => {
  it("shows the card's miles valuation, since the re-fetched offer has none", async () => {
    const card = makeFlight({ id: 'off_9', miles: makeMiles({ equivalentMiles: 52900 }) })
    vi.mocked(fetchOffer).mockResolvedValue({ ...card, miles: null })
    render(<OfferDialog flight={card} passengerCount={1} milheiro={29} onClose={vi.fn()} onResearch={vi.fn()} />)

    expect(await screen.findByText('≈ 52.900 milhas')).toBeInTheDocument()
    expect(plain(screen.getByText(/^Award/).textContent)).toBe('Award Smiles: 60.000 mi + R$ 180 · 4 assentos')
    expect(screen.getByRole('list', { name: 'Como pagar' })).toBeInTheDocument()
    expect(screen.queryByText(/Valores da busca/)).not.toBeInTheDocument()
  })

  it('values the miles with the search milheiro passed in', async () => {
    const base = makeMiles({ equivalentMiles: null })
    const miles = { ...base, options: base.options.map((option) => ({ ...option, milheiroBrl: null, effectiveTotalBrl: null })) }
    const usdMiles = {
      ...miles,
      options: miles.options.map((option) =>
        option.strategy === 'cash' ? { ...option, cash: { amount: 650, currency: 'USD' } } : option,
      ),
    }
    const card = makeFlight({ id: 'off_10', currency: 'USD', price: 650, totalPrice: 650, miles: usdMiles })
    vi.mocked(fetchOffer).mockResolvedValue({ ...card, miles: null })
    render(<OfferDialog flight={card} passengerCount={1} milheiro={29} onClose={vi.fn()} onResearch={vi.fn()} />)
    expect(await screen.findByText('Em milhas: tarifa em USD, sem conversão')).toBeInTheDocument()
    expect(screen.queryByText(/informe o milheiro/)).not.toBeInTheDocument()
  })

  it('labels the miles block as search values when the re-fetched price changed', async () => {
    const card = makeFlight({ id: 'off_11', miles: makeMiles({ equivalentMiles: 52900 }) })
    vi.mocked(fetchOffer).mockResolvedValue({ ...card, price: 3800, totalPrice: 3800, miles: null })
    render(<OfferDialog flight={card} passengerCount={1} milheiro={29} onClose={vi.fn()} onResearch={vi.fn()} />)

    expect(await screen.findByText('Valores da busca (preço mudou)')).toBeInTheDocument()
    expect(screen.getByText('≈ 52.900 milhas')).toBeInTheDocument()
  })

  it('labels the miles block as search values when the currency changed', async () => {
    const card = makeFlight({ id: 'off_12', miles: makeMiles() })
    vi.mocked(fetchOffer).mockResolvedValue({ ...card, currency: 'USD', miles: null })
    render(<OfferDialog flight={card} passengerCount={1} milheiro={29} onClose={vi.fn()} onResearch={vi.fn()} />)

    expect(await screen.findByText('Valores da busca (preço mudou)')).toBeInTheDocument()
  })

  it('has no miles block when the card has no miles', async () => {
    vi.mocked(fetchOffer).mockResolvedValue(searched)
    renderDialog()
    await screen.findByText(/por pessoa/)
    expect(screen.queryByRole('list', { name: 'Como pagar' })).not.toBeInTheDocument()
    expect(screen.queryByText(/milhas/)).not.toBeInTheDocument()
  })
})
