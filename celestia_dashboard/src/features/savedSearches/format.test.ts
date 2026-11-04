import { describe, expect, it } from 'vitest'
import type { SearchParams } from '../../types'
import { describeSavedSearch } from './format'

const base: SearchParams = {
  origin: { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' },
  destination: { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' },
  departDate: new Date(2026, 11, 12),
  returnDate: new Date(2026, 11, 19),
  passengers: { adults: 1, children: 0, infants: 0 },
  tripType: 'roundtrip',
  cabin: 'economy',
}

describe('describeSavedSearch', () => {
  it('formats a round trip', () => {
    expect(describeSavedSearch(base)).toBe('GRU → LIS · 12 dez – 19 dez · 1 adulto')
  })

  it('formats a one-way trip with several passengers and a non-economy cabin', () => {
    expect(
      describeSavedSearch({
        ...base,
        tripType: 'oneway',
        passengers: { adults: 2, children: 2, infants: 1 },
        cabin: 'business',
      }),
    ).toBe('GRU → LIS · 12 dez · 2 adultos, 2 crianças, 1 bebê · Executiva')
  })
})
