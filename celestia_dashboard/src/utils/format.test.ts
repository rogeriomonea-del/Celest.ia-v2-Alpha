import { describe, expect, it } from 'vitest'
import { formatMilheiro, formatMiles, formatMoney } from './format'

/** Intl uses a no-break space between symbol and amount. */
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('formatMoney', () => {
  it('formats BRL in pt-BR without cents', () => {
    expect(plain(formatMoney(3499.6, 'BRL'))).toBe('R$ 3.500')
    expect(plain(formatMoney(12345, 'brl'))).toBe('R$ 12.345')
  })

  it('formats other currencies with their own symbol and cents', () => {
    expect(plain(formatMoney(1234.5, 'USD'))).toBe('US$ 1.234,50')
    expect(plain(formatMoney(980, 'EUR'))).toBe('€ 980,00')
  })
})

describe('formatMiles', () => {
  it('groups thousands with a dot and has no decimals', () => {
    expect(formatMiles(60000)).toBe('60.000')
    expect(formatMiles(1250000)).toBe('1.250.000')
    expect(formatMiles(900)).toBe('900')
    expect(formatMiles(52899.6)).toBe('52.900')
  })
})

describe('formatMilheiro', () => {
  it('shows whole reais without cents and fractional ones with two digits', () => {
    expect(plain(formatMilheiro(29))).toBe('R$ 29')
    expect(plain(formatMilheiro(17.5))).toBe('R$ 17,50')
  })
})
