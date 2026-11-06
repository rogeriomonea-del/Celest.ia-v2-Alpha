import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SearchParams } from '../../types'
import { fromISODate, toISODate } from '../../utils/dates'
import { fromSavedSearchRow, isSameSearch, toSavedSearchInsert } from './mapping'

// Run in Brasília time (UTC-3), where a UTC-based conversion shifts late-evening dates.
const previousTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo'
})
afterAll(() => {
  if (previousTZ === undefined) delete process.env.TZ
  else process.env.TZ = previousTZ
})

const GRU = { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' }
const LIS = { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' }

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    origin: GRU,
    destination: LIS,
    departDate: new Date(2026, 11, 12, 22, 30),
    returnDate: new Date(2026, 11, 19, 23, 59),
    passengers: { adults: 2, children: 1, infants: 1 },
    tripType: 'roundtrip',
    cabin: 'premium',
    ...overrides,
  }
}

function asRow(p: SearchParams) {
  return { id: 'saved-1', created_at: '2026-11-04T12:00:00Z', ...toSavedSearchInsert(p) }
}

describe('local ISO dates', () => {
  it('formats the local calendar day, not the UTC one', () => {
    const lateEvening = new Date(2026, 11, 12, 22, 30)
    expect(lateEvening.getTimezoneOffset()).toBe(180)
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-12-13')
    expect(toISODate(lateEvening)).toBe('2026-12-12')
  })

  it('parses to local midnight of the same day', () => {
    const date = fromISODate('2026-12-12')
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 11, 12, 0])
  })

  it('rejects malformed or impossible dates', () => {
    expect(() => fromISODate('2026-02-30')).toThrow(RangeError)
    expect(() => fromISODate('12/12/2026')).toThrow(RangeError)
  })
})

describe('saved search mapping', () => {
  it('maps SearchParams to an insert row with local dates', () => {
    expect(toSavedSearchInsert(params())).toEqual({
      origin: GRU,
      destination: LIS,
      depart_date: '2026-12-12',
      return_date: '2026-12-19',
      trip_type: 'roundtrip',
      cabin: 'premium',
      adults: 2,
      children: 1,
      infants: 1,
    })
  })

  it('round-trips a round trip', () => {
    const saved = fromSavedSearchRow(asRow(params()))
    expect(saved).not.toBeNull()
    expect(saved!.id).toBe('saved-1')
    expect(saved!.createdAt).toBe('2026-11-04T12:00:00Z')
    const p = saved!.params
    expect(toISODate(p.departDate!)).toBe('2026-12-12')
    expect(toISODate(p.returnDate!)).toBe('2026-12-19')
    expect(p.departDate!.getHours()).toBe(0)
    expect({ ...p, departDate: null, returnDate: null }).toEqual({
      ...params(),
      departDate: null,
      returnDate: null,
    })
  })

  it('round-trips a one-way search with a null return date', () => {
    // A stale return date from the form is dropped for one-way trips.
    const oneWay = params({ tripType: 'oneway' })
    const row = asRow(oneWay)
    expect(row.return_date).toBeNull()
    const saved = fromSavedSearchRow(row)
    expect(saved!.params.tripType).toBe('oneway')
    expect(saved!.params.returnDate).toBeNull()
    expect(toISODate(saved!.params.departDate!)).toBe('2026-12-12')
  })

  it('requires a departure date', () => {
    expect(() => toSavedSearchInsert(params({ departDate: null }))).toThrow()
  })

  it('drops rows with an unexpected shape', () => {
    expect(fromSavedSearchRow({ ...asRow(params()), origin: 'GRU' })).toBeNull()
    expect(fromSavedSearchRow({ ...asRow(params()), depart_date: 'amanhã' })).toBeNull()
  })

  it('treats searches with the same route, days, passengers and cabin as equal', () => {
    const same = params({
      departDate: new Date(2026, 11, 12, 8),
      returnDate: new Date(2026, 11, 19, 8),
    })
    expect(isSameSearch(params(), same)).toBe(true)
    expect(isSameSearch(params(), params({ cabin: 'business' }))).toBe(false)
    expect(isSameSearch(params(), params({ returnDate: new Date(2026, 11, 20) }))).toBe(false)
    expect(
      isSameSearch(params(), params({ passengers: { adults: 2, children: 0, infants: 1 } })),
    ).toBe(false)
  })
})
