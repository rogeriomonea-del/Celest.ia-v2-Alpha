import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchRequest } from '../../src/shared/api.js'
import type { AwardFare } from '../../src/types.js'
import type { MilesSettings } from '../miles/calculator.js'
import { AWARD_NOTES, lookupAwards } from './index.js'
import { searchAwards } from './seatsAero.js'

vi.mock('./seatsAero.js', () => ({ searchAwards: vi.fn() }))
const searchAwardsMock = vi.mocked(searchAwards)

const KEY = 'seats_aero_dummy_key_for_unit_tests'

const req: SearchRequest = {
  origin: 'GRU',
  destination: 'MAD',
  departDate: '2026-12-01',
  returnDate: null,
  passengers: { adults: 1, children: 0, infants: 0 },
  cabin: 'business',
}
const smiles: MilesSettings = { program: 'smiles', programName: 'Smiles (GOL)', milheiroBrl: 22, balance: 0 }
const latam: MilesSettings = { program: 'latampass', programName: 'LATAM Pass', milheiroBrl: 29, balance: 0 }

const fare = (cabin: AwardFare['cabin'], miles: number): AwardFare => ({
  program: 'smiles',
  programName: 'Smiles (GOL)',
  cabin,
  miles,
  taxes: null,
  seatsLeft: null,
  direct: false,
  flightNumbers: null,
  matchesItinerary: false,
  source: 'seats_aero',
  fetchedAt: '2026-11-06T12:00:00.000Z',
  bookingUrl: null,
})

beforeEach(() => {
  vi.stubEnv('SEATS_AERO_API_KEY', KEY)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  searchAwardsMock.mockReset()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('lookupAwards', () => {
  it('skips programs without an award source', async () => {
    const result = await lookupAwards(req, latam, new AbortController().signal)
    expect(result).toEqual({ awardsByCabin: {}, awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.unsupported })
    expect(searchAwardsMock).not.toHaveBeenCalled()
  })

  it('skips the lookup when SEATS_AERO_API_KEY is not set', async () => {
    vi.stubEnv('SEATS_AERO_API_KEY', '  ')
    const result = await lookupAwards(req, smiles, new AbortController().signal)
    expect(result).toEqual({ awardsByCabin: {}, awardSource: null, awardsSearched: false, awardsNote: AWARD_NOTES.notConfigured })
    expect(searchAwardsMock).not.toHaveBeenCalled()
  })

  it('asks the provider for the searched route, outbound date and cabin, and keeps the fewest-miles award per cabin', async () => {
    searchAwardsMock.mockResolvedValue([fare('business', 90_000), fare('business', 70_000), fare('economy', 30_000)])
    const result = await lookupAwards(req, smiles, new AbortController().signal)
    expect(result.awardSource).toBe('seats_aero')
    expect(result.awardsSearched).toBe(true)
    expect(result.awardsNote).toBeNull()
    expect(result.awardsByCabin.business?.miles).toBe(70_000)
    expect(result.awardsByCabin.economy?.miles).toBe(30_000)

    const [lookup, options] = searchAwardsMock.mock.calls[0]
    expect(lookup).toMatchObject({ cabin: 'business', origin: 'GRU', destination: 'MAD', date: '2026-12-01' })
    expect(lookup.program.code).toBe('smiles')
    expect(options.apiKey).toBe(KEY)
  })

  it('turns a provider error into a note, never a failure, and does not log the key', async () => {
    searchAwardsMock.mockRejectedValue(new Error(`HTTP 500 for key ${KEY}`))
    const result = await lookupAwards(req, smiles, new AbortController().signal)
    expect(result).toEqual({ awardsByCabin: {}, awardSource: 'seats_aero', awardsSearched: false, awardsNote: AWARD_NOTES.failed })
    const logged = vi.mocked(console.error).mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[awards]')
    expect(logged).not.toContain(KEY)
  })

  it('gives up on a provider that hangs once the timeout elapses, aborting its signal', async () => {
    let providerSignal: AbortSignal | undefined
    // Never settles, even on abort.
    searchAwardsMock.mockImplementation((_lookup, options) => {
      providerSignal = options.signal
      return new Promise(() => {})
    })
    const started = Date.now()
    const result = await lookupAwards(req, smiles, new AbortController().signal, 50)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(result).toEqual({ awardsByCabin: {}, awardSource: 'seats_aero', awardsSearched: false, awardsNote: AWARD_NOTES.failed })
    expect(providerSignal?.aborted).toBe(true)
  })

  it('stops when the request signal aborts', async () => {
    searchAwardsMock.mockImplementation(() => new Promise(() => {}))
    const controller = new AbortController()
    const pending = lookupAwards(req, smiles, controller.signal)
    controller.abort()
    expect((await pending).awardsNote).toBe(AWARD_NOTES.failed)
  })
})
