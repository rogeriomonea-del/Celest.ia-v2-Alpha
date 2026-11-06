// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlaneTakeoff } from 'lucide-react'
import { AirportInput, PLACES_DEBOUNCE_MS } from './AirportInput'
import { fetchPlaces } from '../lib/api'
import { findAirport } from '../data/airports'
import type { Airport } from '../types'

vi.mock('../lib/api', () => ({ fetchPlaces: vi.fn() }))

const remote = (code: string, city = `Cidade ${code}`): Airport => ({
  code,
  city,
  name: `Aeroporto ${code}`,
  country: 'Remoto',
})

function renderInput() {
  const onChange = vi.fn()
  render(
    <AirportInput label="Origem" icon={PlaneTakeoff} value={findAirport('GRU')} onChange={onChange} />,
  )
  const input = screen.getByRole('combobox', { name: 'Origem' })
  return { input, onChange }
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

/** Lets resolved fetchPlaces promises settle inside act. */
async function flush() {
  await act(async () => {})
}

function optionCodes(): string[] {
  return screen.queryAllByRole('option').map((option) => option.lastElementChild!.textContent ?? '')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('AirportInput remote suggestions', () => {
  it('makes no remote call for queries under 2 characters', async () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'L')
    await advance(PLACES_DEBOUNCE_MS * 4)
    type(input, ' L ')
    await advance(PLACES_DEBOUNCE_MS * 4)
    expect(fetchPlaces).not.toHaveBeenCalled()
  })

  it('debounces the request by PLACES_DEBOUNCE_MS', async () => {
    vi.mocked(fetchPlaces).mockReturnValue(new Promise(() => {}))
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'Li')
    await advance(PLACES_DEBOUNCE_MS - 50)
    type(input, 'Lis')
    await advance(PLACES_DEBOUNCE_MS - 1)
    expect(fetchPlaces).not.toHaveBeenCalled()
    expect(screen.getByText('Buscando aeroportos…')).toBeInTheDocument()

    await advance(1)
    expect(fetchPlaces).toHaveBeenCalledTimes(1)
    expect(fetchPlaces).toHaveBeenCalledWith('Lis', expect.any(AbortSignal))
  })

  it('merges local and remote suggestions, local first, deduped, at most 8', async () => {
    vi.mocked(fetchPlaces).mockResolvedValue([
      findAirport('LIS'),
      remote('AAA'),
      remote('BBB'),
      remote('CCC'),
      remote('DDD'),
      remote('EEE'),
      remote('FFF'),
      remote('GGG'),
    ])
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'lis')
    expect(optionCodes()).toEqual(['LIS', 'FLN'])

    await advance(PLACES_DEBOUNCE_MS)
    await flush()

    expect(optionCodes()).toEqual(['LIS', 'FLN', 'AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'])
    expect(screen.queryByText('Buscando aeroportos…')).not.toBeInTheDocument()
  })

  it('falls back to the local list when the remote call fails', async () => {
    vi.mocked(fetchPlaces).mockRejectedValue(new Error('offline'))
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'lis')

    await advance(PLACES_DEBOUNCE_MS)
    await flush()

    expect(fetchPlaces).toHaveBeenCalledTimes(1)
    expect(optionCodes()).toEqual(['LIS', 'FLN'])
    expect(screen.queryByText('Buscando aeroportos…')).not.toBeInTheDocument()
  })

  it('aborts a stale request; only the fresh answer is shown', async () => {
    // Like fetch: the pending request rejects with an AbortError once aborted.
    vi.mocked(fetchPlaces)
      .mockImplementationOnce(
        (_q, signal) =>
          new Promise((_resolve, reject) =>
            signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      )
      .mockResolvedValueOnce([remote('NEW')])
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'xy')
    await advance(PLACES_DEBOUNCE_MS)
    const firstSignal = vi.mocked(fetchPlaces).mock.calls[0][1]!
    expect(firstSignal.aborted).toBe(false)

    type(input, 'xyz')
    expect(firstSignal.aborted).toBe(true)

    await advance(PLACES_DEBOUNCE_MS)
    await flush()

    expect(fetchPlaces).toHaveBeenCalledTimes(2)
    expect(fetchPlaces).toHaveBeenLastCalledWith('xyz', expect.any(AbortSignal))
    expect(optionCodes()).toEqual(['NEW'])
    expect(screen.queryByText('Buscando aeroportos…')).not.toBeInTheDocument()
  })

  it('ignores an answer that arrives after its request was aborted', async () => {
    // A fake that, unlike fetch, still resolves after abort.
    let resolveStale!: (places: Airport[]) => void
    vi.mocked(fetchPlaces)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)))
      .mockReturnValueOnce(new Promise(() => {}))
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'xy')
    await advance(PLACES_DEBOUNCE_MS)
    const staleSignal = vi.mocked(fetchPlaces).mock.calls[0][1]!

    type(input, 'xyz')
    await advance(PLACES_DEBOUNCE_MS)
    expect(staleSignal.aborted).toBe(true)
    expect(fetchPlaces).toHaveBeenCalledTimes(2)

    resolveStale([remote('OLD')])
    await flush()

    // The fresh request is still pending: its loading row must stay.
    expect(screen.getByText('Buscando aeroportos…')).toBeInTheDocument()
    expect(optionCodes()).not.toContain('OLD')

    // Going back to the stale query must not show the late answer as cached.
    type(input, 'xy')
    expect(optionCodes()).not.toContain('OLD')
  })

  it('aborts the pending request when the input closes', async () => {
    vi.mocked(fetchPlaces).mockReturnValue(new Promise(() => {}))
    const { input } = renderInput()
    fireEvent.focus(input)
    type(input, 'lis')
    await advance(PLACES_DEBOUNCE_MS)
    const signal = vi.mocked(fetchPlaces).mock.calls[0][1]!

    fireEvent.blur(input)

    expect(signal.aborted).toBe(true)
  })
})

describe('AirportInput interaction', () => {
  it('closes on blur and shows the current value again', () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'true')

    fireEvent.blur(input)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('São Paulo (GRU)')
  })

  it('selects a local suggestion with Enter', () => {
    const { input, onChange } = renderInput()
    fireEvent.focus(input)
    type(input, 'lis')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(findAirport('LIS'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('reaches a remote suggestion with the arrow keys', async () => {
    const porto = remote('XPT', 'Porto Remoto')
    vi.mocked(fetchPlaces).mockResolvedValue([porto])
    const { input, onChange } = renderInput()
    fireEvent.focus(input)
    type(input, 'lis')
    await advance(PLACES_DEBOUNCE_MS)
    await flush()
    expect(optionCodes()).toEqual(['LIS', 'FLN', 'XPT'])

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2].id)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(porto)
  })
})
