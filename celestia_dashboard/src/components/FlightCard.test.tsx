// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { FlightCard } from './FlightCard'
import { LATAM, makeFlight, makeSlice } from '../test/flights'
import type { Flight } from '../types'

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

    it('show refundable and changeable when known', () => {
      const details = openDetails(makeFlight({ conditions: { refundable: true, changeable: true, refundPenalty: null, changePenalty: null } }))
      expect(within(details).getByText('Reembolsável')).toBeInTheDocument()
      expect(within(details).getByText('Remarcável')).toBeInTheDocument()
    })

    it('show "Não reembolsável" and no change label when not refundable nor changeable', () => {
      const details = openDetails(makeFlight({ conditions: { refundable: false, changeable: false, refundPenalty: null, changePenalty: null } }))
      expect(within(details).getByText('Não reembolsável')).toBeInTheDocument()
      expect(within(details).queryByText('Remarcável')).not.toBeInTheDocument()
    })
  })
})
