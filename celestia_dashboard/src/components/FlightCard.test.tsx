// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { FlightCard } from './FlightCard'
import { LATAM, makeFlight, makeMiles, makeSlice } from '../test/flights'
import type { Flight, FlightMiles, PurchaseOption } from '../types'

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

function renderCard(flight: Flight, passengerCount = 1, onViewOffer = vi.fn()) {
  render(
    <FlightCard
      flight={flight}
      passengerCount={passengerCount}
      isCheapest={false}
      isFastest={false}
      onViewOffer={onViewOffer}
    />,
  )
  return onViewOffer
}

afterEach(cleanup)

describe('FlightCard', () => {
  it('shows a return row for a round trip', () => {
    const returnSlice = makeSlice({
      departure: { time: '13:10', airportCode: 'LIS', date: '2026-12-09' },
      arrival: { time: '20:45', airportCode: 'GRU', dayOffset: 0 },
      durationMin: 635,
      stops: [{ airportCode: 'MAD', city: 'Madri', layoverMin: 90 }],
    })
    renderCard(makeFlight({ slices: [makeSlice(), returnSlice] }))

    const row = screen.getByTestId('return-slice')
    expect(row).toHaveTextContent('Volta')
    expect(row).toHaveTextContent('13:10 – 20:45')
    expect(row).toHaveTextContent('LIS → GRU')
    expect(row).toHaveTextContent('10h 35m')
    expect(row).toHaveTextContent('1 escala')
  })

  it('has no return row for a one-way offer', () => {
    renderCard(makeFlight())
    expect(screen.queryByTestId('return-slice')).not.toBeInTheDocument()
  })

  it('shows the per-person price and the total for several passengers', () => {
    renderCard(makeFlight({ price: 3500, totalPrice: 7000 }), 2)
    expect(plain(screen.getByText(/por pessoa/).previousElementSibling!.textContent)).toBe('R$ 3.500')
    expect(plain(screen.getByText(/^Total/).textContent)).toBe('Total R$ 7.000 · 2 passageiros')
  })

  it('omits the total line for a single passenger', () => {
    renderCard(makeFlight())
    expect(screen.queryByText(/^Total/)).not.toBeInTheDocument()
  })

  it('shows the carrier logo and falls back to the code tile when it fails to load', () => {
    renderCard(makeFlight({ airline: { ...LATAM, logoUrl: 'https://assets.example/LA.svg' } }))
    const logo = screen.getByRole('img', { name: 'LATAM' })
    expect(logo).toHaveAttribute('src', 'https://assets.example/LA.svg')

    fireEvent.error(logo)

    expect(screen.queryByRole('img', { name: 'LATAM' })).not.toBeInTheDocument()
    expect(screen.getByText('LA')).toBeInTheDocument()
  })

  it('"Ver oferta" passes the flight to the callback', () => {
    const flight = makeFlight()
    const onViewOffer = renderCard(flight)
    fireEvent.click(screen.getByRole('button', { name: 'Ver oferta' }))
    expect(onViewOffer).toHaveBeenCalledWith(flight)
  })

  describe('conditions in the details', () => {
    function openDetails(flight: Flight) {
      renderCard(flight)
      fireEvent.click(screen.getByRole('button', { name: 'Detalhes do voo' }))
      return screen.getByText(/Bagagem de mão/).closest('div') as HTMLElement
    }

    it('are hidden when the provider does not know them', () => {
      const details = openDetails(makeFlight({ conditions: { refundable: null, changeable: null, refundPenalty: null, changePenalty: null } }))
      expect(within(details).queryByText(/reembolsável/i)).not.toBeInTheDocument()
      expect(within(details).queryByText('Remarcável')).not.toBeInTheDocument()
    })

    it('show refundable and changeable when allowed with no fee', () => {
      const free = { amount: 0, currency: 'BRL' }
      const details = openDetails(makeFlight({ conditions: { refundable: true, changeable: true, refundPenalty: free, changePenalty: free } }))
      expect(within(details).getByText('Reembolsável')).toBeInTheDocument()
      expect(within(details).getByText('Remarcável')).toBeInTheDocument()
    })

    it('spell out the fee when refund or change is allowed with a penalty', () => {
      const details = openDetails(
        makeFlight({
          conditions: {
            refundable: true,
            changeable: true,
            refundPenalty: { amount: 450, currency: 'BRL' },
            changePenalty: { amount: 120, currency: 'USD' },
          },
        }),
      )
      expect(plain(within(details).getByText(/^Reembolsável com multa de/).textContent)).toBe(
        'Reembolsável com multa de R$ 450',
      )
      expect(plain(within(details).getByText(/^Remarcação com taxa de/).textContent)).toBe(
        'Remarcação com taxa de US$ 120,00',
      )
      expect(within(details).queryByText('Reembolsável')).not.toBeInTheDocument()
      expect(within(details).queryByText('Remarcável')).not.toBeInTheDocument()
    })

    it('flag an unknown fee instead of claiming the condition is free', () => {
      const details = openDetails(makeFlight({ conditions: { refundable: true, changeable: true, refundPenalty: null, changePenalty: null } }))
      expect(within(details).getByText('Reembolsável (taxa a confirmar)')).toBeInTheDocument()
      expect(within(details).getByText('Remarcável (taxa a confirmar)')).toBeInTheDocument()
      expect(within(details).queryByText('Reembolsável')).not.toBeInTheDocument()
      expect(within(details).queryByText('Remarcável')).not.toBeInTheDocument()
    })

    it('show "Não reembolsável" and "Não remarcável" when not refundable nor changeable', () => {
      const details = openDetails(makeFlight({ conditions: { refundable: false, changeable: false, refundPenalty: null, changePenalty: null } }))
      expect(within(details).getByText('Não reembolsável')).toBeInTheDocument()
      expect(within(details).getByText('Não remarcável')).toBeInTheDocument()
      expect(within(details).queryByText('Remarcável')).not.toBeInTheDocument()
    })
  })

  describe('emissions in the details', () => {
    function openDetails(flight: Flight) {
      renderCard(flight)
      fireEvent.click(screen.getByRole('button', { name: 'Detalhes do voo' }))
    }

    it('are hidden when the provider has no CO₂ estimate', () => {
      openDetails(makeFlight({ emissions: 'low', emissionsKg: null }))
      expect(screen.queryByText(/Emissões/)).not.toBeInTheDocument()
    })

    it('show the bucket and the CO₂ estimate when known', () => {
      openDetails(makeFlight({ emissions: 'low', emissionsKg: 412 }))
      expect(plain(screen.getByText(/Emissões/).textContent)).toBe('Emissões abaixo da média · 412 kg CO₂')
    })
  })
})

describe('FlightCard miles', () => {
  /** Replaces the effective totals of the award and cash options. */
  function withTotals(award: number | null, cash: number | null): FlightMiles {
    const base = makeMiles()
    const totals: Record<PurchaseOption['strategy'], number | null> = { award, cash }
    return { ...base, options: base.options.map((option) => ({ ...option, effectiveTotalBrl: totals[option.strategy] })) }
  }

  it('shows nothing about miles when the search did not ask for a program', () => {
    renderCard(makeFlight({ miles: null }))
    expect(screen.queryByText(/milhas/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Award/)).not.toBeInTheDocument()
    expect(screen.queryByText('Vale com milhas')).not.toBeInTheDocument()
  })

  it('shows the fare in miles with the milheiro used in its title', () => {
    renderCard(makeFlight({ miles: makeMiles({ equivalentMiles: 52900 }) }))
    const line = screen.getByText('≈ 52.900 milhas')
    expect(plain(line.getAttribute('title'))).toBe('ao milheiro de R$ 29')
  })

  it('asks for the milheiro when the fare could not be valued for lack of one', () => {
    const base = makeMiles()
    renderCard(
      makeFlight({
        miles: {
          ...base,
          equivalentMiles: null,
          options: base.options.map((option) => ({ ...option, milheiroBrl: null, effectiveTotalBrl: null })),
        },
      }),
    )
    expect(screen.getByText(/informe o milheiro/)).toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })

  it('shows the award line with miles, taxes and seats', () => {
    renderCard(makeFlight({ miles: makeMiles() }))
    expect(plain(screen.getByText(/^Award/).textContent)).toBe('Award Smiles: 60.000 mi + R$ 180 · 4 assentos')
    expect(screen.queryByText(/voos podem diferir/)).not.toBeInTheDocument()
  })

  it('warns that the award flights may differ when it is not for this itinerary', () => {
    const base = makeMiles()
    renderCard(makeFlight({ miles: { ...base, award: { ...base.award!, matchesItinerary: false, seatsLeft: 1 } } }))
    expect(plain(screen.getByText(/^Award/).textContent)).toBe(
      'Award Smiles: 60.000 mi + R$ 180 · 1 assento· voos podem diferir',
    )
  })

  it('has no award line when no award was found', () => {
    renderCard(makeFlight({ miles: makeMiles({ award: null }) }))
    expect(screen.queryByText(/^Award/)).not.toBeInTheDocument()
    expect(screen.getByText('≈ 120.690 milhas')).toBeInTheDocument()
  })

  it('badges "Vale com milhas" only when the award costs less than paying cash', () => {
    renderCard(makeFlight({ miles: withTotals(1920, 3500) }))
    expect(screen.getByText('Vale com milhas')).toBeInTheDocument()
    cleanup()

    renderCard(makeFlight({ miles: withTotals(3600, 3500) }))
    expect(screen.queryByText('Vale com milhas')).not.toBeInTheDocument()
    cleanup()

    renderCard(makeFlight({ miles: withTotals(3500, 3500) }))
    expect(screen.queryByText('Vale com milhas')).not.toBeInTheDocument()
    cleanup()

    // Unknown effective cost (no milheiro): no claim either way.
    renderCard(makeFlight({ miles: withTotals(null, 3500) }))
    expect(screen.queryByText('Vale com milhas')).not.toBeInTheDocument()
  })

  it('lists every way to pay in the details, with effective cost and notes', () => {
    const base = makeMiles()
    const miles = { ...base, options: [base.options[0], { ...base.options[1], effectiveTotalBrl: null }] }
    renderCard(makeFlight({ miles }))
    expect(screen.queryByRole('list', { name: 'Como pagar' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes do voo' }))

    const list = screen.getByRole('list', { name: 'Como pagar' })
    const items = within(list).getAllByRole('listitem').filter((item) => item.parentElement === list)
    expect(items).toHaveLength(2)
    expect(plain(items[0].textContent)).toBe(
      'Emissão em milhas (Smiles): 60.000 mi + R$ 180 · custo efetivo R$ 1.920' +
        'Saldo insuficiente: faltam 10.000 milhas',
    )
    expect(plain(items[1].textContent)).toBe('Passagem em dinheiro: R$ 3.500 · custo efetivo —')
  })
})
