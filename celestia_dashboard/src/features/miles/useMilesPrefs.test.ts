// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { DEFAULT_MILES_PREFS, effectiveMilheiro, MILES_PREFS_KEY, useMilesPrefs } from './useMilesPrefs'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useMilesPrefs', () => {
  it('starts with the defaults: disabled, LATAM Pass, program milheiro, no balance', () => {
    const { result } = renderHook(() => useMilesPrefs())
    expect(result.current.prefs).toEqual({ enabled: false, program: 'latampass', milheiroBrl: null, balance: 0 })
    expect(DEFAULT_MILES_PREFS).toEqual(result.current.prefs)
  })

  it('persists the prefs and reads them back on the next mount', () => {
    const next = { enabled: true, program: 'smiles', milheiroBrl: 18.5, balance: 50000 }
    const first = renderHook(() => useMilesPrefs())
    act(() => first.result.current.setPrefs(next))
    expect(first.result.current.prefs).toEqual(next)
    expect(JSON.parse(window.localStorage.getItem(MILES_PREFS_KEY)!)).toEqual(next)
    first.unmount()

    const second = renderHook(() => useMilesPrefs())
    expect(second.result.current.prefs).toEqual(next)
  })

  it.each([
    ['not JSON', '{oops'],
    ['wrong shape', JSON.stringify({ enabled: 'yes' })],
    ['unknown program', JSON.stringify({ enabled: true, program: 'nope', milheiroBrl: null, balance: 0 })],
    ['negative balance', JSON.stringify({ enabled: true, program: 'smiles', milheiroBrl: null, balance: -1 })],
  ])('falls back to the defaults when the stored value is corrupt (%s)', (_label, raw) => {
    window.localStorage.setItem(MILES_PREFS_KEY, raw)
    const { result } = renderHook(() => useMilesPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_MILES_PREFS)
  })

  it('keeps working when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { result } = renderHook(() => useMilesPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_MILES_PREFS)

    const next = { ...DEFAULT_MILES_PREFS, enabled: true }
    act(() => result.current.setPrefs(next))
    expect(result.current.prefs).toEqual(next)
  })
})

describe('effectiveMilheiro', () => {
  it("is the user's milheiro, else the program default, else null", () => {
    expect(effectiveMilheiro({ program: 'latampass', milheiroBrl: 18 })).toBe(18)
    expect(effectiveMilheiro({ program: 'latampass', milheiroBrl: null })).toBe(29)
    expect(effectiveMilheiro({ program: 'lifemiles', milheiroBrl: null })).toBeNull()
    expect(effectiveMilheiro({ program: 'unknown', milheiroBrl: null })).toBeNull()
  })
})
