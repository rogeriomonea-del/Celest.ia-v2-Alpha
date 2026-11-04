import { describe, expect, it } from 'vitest'
import { formatMoney } from './format'

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
