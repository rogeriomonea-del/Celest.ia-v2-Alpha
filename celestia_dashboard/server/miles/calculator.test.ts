import { describe, expect, it } from 'vitest'
import type { AwardFare } from '../../src/types.js'
import { makeFlight } from '../../src/test/flights.js'
import { valueOffer } from './calculator.js'
import type { MilesSettings } from './calculator.js'

const smiles: MilesSettings = { program: 'smiles', programName: 'Smiles (GOL)', milheiroBrl: 22, balance: 100_000, passengers: 1 }

const brlOffer = (price: number) => makeFlight({ id: `off_${price}`, price, totalPrice: price * 2, currency: 'BRL' })

function award(overrides: Partial<AwardFare> = {}): AwardFare {
  return {
    program: 'smiles',
    programName: 'Smiles (GOL)',
    cabin: 'economy',
    miles: 60_000,
    taxes: { amount: 150, currency: 'BRL' },
    seatsLeft: 4,
    direct: true,
    flightNumbers: ['G3 1234'],
    matchesItinerary: true,
    source: 'seats_aero',
    fetchedAt: '2026-11-06T12:00:00.000Z',
    bookingUrl: null,
    ...overrides,
  }
}

describe('valueOffer', () => {
  it('values a BRL cash fare in miles (price / milheiro x 1000, rounded) with a single cash option', () => {
    const result = valueOffer(brlOffer(1234.56), { ...smiles, milheiroBrl: 29 }, null, 'premium')
    expect(result.equivalentMiles).toBe(42_571)
    expect(result.award).toBeNull()
    expect(result.options).toEqual([
      {
        strategy: 'cash',
        label: 'Passagem em dinheiro',
        cabin: 'premium',
        cash: { amount: 1234.56, currency: 'BRL' },
        miles: 0,
        program: null,
        milheiroBrl: null,
        effectiveTotalBrl: 1234.56,
        breakevenMilheiroBrl: null,
        notes: [],
      },
    ])
  })

  it('leaves equivalentMiles null when the milheiro is unknown', () => {
    expect(valueOffer(brlOffer(2200), { ...smiles, milheiroBrl: null }, null, 'economy').equivalentMiles).toBeNull()
  })

  it('does not value a USD cash fare: equivalentMiles and effectiveTotalBrl are null', () => {
    const offer = makeFlight({ price: 500, totalPrice: 500, currency: 'USD' })
    const result = valueOffer(offer, smiles, null, 'economy')
    expect(result.equivalentMiles).toBeNull()
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toMatchObject({ cash: { amount: 500, currency: 'USD' }, effectiveTotalBrl: null })
  })

  it('values an award with taxes, computes the breakeven against this offer and ranks it first', () => {
    const fare = award()
    const result = valueOffer(brlOffer(2200), smiles, fare, 'economy')
    expect(result.equivalentMiles).toBe(100_000)
    expect(result.award).toBe(fare)
    expect(result.options.map((o) => o.strategy)).toEqual(['award', 'cash'])
    expect(result.options[0]).toEqual({
      strategy: 'award',
      label: 'Emissão em milhas (Smiles (GOL))',
      cabin: 'economy',
      cash: { amount: 150, currency: 'BRL' },
      miles: 60_000,
      program: 'smiles',
      milheiroBrl: 22,
      // 150 + 60 x 22
      effectiveTotalBrl: 1470,
      // (2200 - 150) / 60,000 x 1000
      breakevenMilheiroBrl: 34.17,
      notes: ['Vale a pena com milheiro <= R$ 34,17', 'Equivalente em dinheiro: R$ 1.470,00 (milheiro R$ 22,00)'],
    })
  })

  it('computes each breakeven from its own offer price, never from another fare', () => {
    const fare = award()
    const cheap = valueOffer(brlOffer(1000), smiles, fare, 'economy')
    const pricey = valueOffer(brlOffer(5000), smiles, fare, 'economy')
    const breakevenOf = (r: ReturnType<typeof valueOffer>) => r.options.find((o) => o.strategy === 'award')?.breakevenMilheiroBrl
    // (1000 - 150) / 60 and (5000 - 150) / 60
    expect(breakevenOf(cheap)).toBe(14.17)
    expect(breakevenOf(pricey)).toBe(80.83)
    expect(cheap.options.find((o) => o.strategy === 'award')?.notes).not.toContainEqual(expect.stringMatching(/^Vale a pena/))
  })

  it('clamps the breakeven at zero when the taxes alone exceed the cash fare', () => {
    const result = valueOffer(brlOffer(100), smiles, award({ taxes: { amount: 300, currency: 'BRL' } }), 'economy')
    expect(result.options.find((o) => o.strategy === 'award')?.breakevenMilheiroBrl).toBe(0)
  })

  it('values an award from another program without the milheiro and without a balance note', () => {
    const fare = award({ program: 'azul', programName: 'Azul Fidelidade' })
    const result = valueOffer(brlOffer(2200), { ...smiles, balance: 0 }, fare, 'economy')
    const option = result.options.find((o) => o.strategy === 'award')
    expect(option).toMatchObject({
      label: 'Emissão em milhas (Azul Fidelidade)',
      program: 'azul',
      milheiroBrl: null,
      effectiveTotalBrl: null,
      breakevenMilheiroBrl: 34.17,
      notes: [],
    })
  })

  it('notes an insufficient balance with the missing miles in pt-BR format', () => {
    const result = valueOffer(brlOffer(2200), { ...smiles, balance: 12_345 }, award(), 'economy')
    expect(result.options.find((o) => o.strategy === 'award')?.notes).toContain('Saldo insuficiente: faltam 47.655 milhas')
  })

  it('compares the balance with the miles for every seated passenger', () => {
    const notes = (balance: number, passengers: number) =>
      valueOffer(brlOffer(2200), { ...smiles, balance, passengers }, award(), 'economy').options.find((o) => o.strategy === 'award')?.notes
    // 60,000 x 3 - 100,000
    expect(notes(100_000, 3)).toContain('Saldo insuficiente: faltam 80.000 milhas para 3 passageiros')
    expect(notes(180_000, 3)?.join(' ')).not.toContain('Saldo insuficiente')
    expect(notes(12_345, 1)).toContain('Saldo insuficiente: faltam 47.655 milhas')
  })

  it('has no balance note when the balance covers the award exactly', () => {
    const result = valueOffer(brlOffer(2200), { ...smiles, balance: 60_000 }, award(), 'economy')
    expect(result.options.find((o) => o.strategy === 'award')?.notes.join(' ')).not.toContain('Saldo insuficiente')
  })

  it('warns when the award flights may differ from the offer', () => {
    const result = valueOffer(brlOffer(2200), smiles, award({ matchesItinerary: false }), 'economy')
    expect(result.options.find((o) => o.strategy === 'award')?.notes).toContain('Voos podem diferir da oferta')
  })

  it('does not value an award with unknown taxes: shown as R$ 0, no total, breakeven or verdict, ranked last', () => {
    // Without taxes 60 x 22 = 1320 would undercut the 1400 cash fare; unknown taxes must not win that way.
    const result = valueOffer(brlOffer(1400), smiles, award({ taxes: null }), 'economy')
    const option = result.options.find((o) => o.strategy === 'award')
    expect(option?.cash).toEqual({ amount: 0, currency: 'BRL' })
    expect(option?.effectiveTotalBrl).toBeNull()
    expect(option?.breakevenMilheiroBrl).toBeNull()
    expect(option?.notes).toEqual(['Taxas não informadas pelo provedor'])
    expect(result.options.map((o) => o.strategy)).toEqual(['cash', 'award'])
  })

  it('does not value an award whose taxes are in another currency', () => {
    const result = valueOffer(brlOffer(2200), smiles, award({ taxes: { amount: 5.6, currency: 'USD' } }), 'economy')
    const option = result.options.find((o) => o.strategy === 'award')
    expect(option).toMatchObject({ cash: { amount: 5.6, currency: 'USD' }, effectiveTotalBrl: null, breakevenMilheiroBrl: null })
  })

  it('sorts options by effective BRL total with unvalued options last', () => {
    // USD cash cannot be valued; the BRL-taxed award can.
    const usd = makeFlight({ price: 500, totalPrice: 500, currency: 'USD' })
    expect(valueOffer(usd, smiles, award(), 'economy').options.map((o) => o.strategy)).toEqual(['award', 'cash'])
    // Award from another program cannot be valued; BRL cash can.
    const other = award({ program: 'azul', programName: 'Azul Fidelidade', miles: 1000 })
    expect(valueOffer(brlOffer(2200), smiles, other, 'economy').options.map((o) => o.strategy)).toEqual(['cash', 'award'])
    // Both valued: cheaper first.
    expect(valueOffer(brlOffer(1000), smiles, award(), 'economy').options.map((o) => o.strategy)).toEqual(['cash', 'award'])
  })
})
