import { useMemo, useRef, useState } from 'react'
import { Plane, type LucideIcon } from 'lucide-react'
import { AIRPORTS } from '../data/airports'
import { useClickOutside } from '../hooks/useClickOutside'
import { normalizeText } from '../utils/format'
import type { Airport } from '../types'

interface AirportInputProps {
  label: string
  icon: LucideIcon
  value: Airport
  onChange: (airport: Airport) => void
  /** Airport shown greyed-out in the list (e.g. the other endpoint of the route). */
  excludeCode?: string
}

const MAX_SUGGESTIONS = 8

export function AirportInput({ label, icon: Icon, value, onChange, excludeCode }: AirportInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useClickOutside(containerRef, () => setOpen(false), open)

  const suggestions = useMemo(() => {
    const normalized = normalizeText(query.trim())
    if (!normalized) return AIRPORTS.slice(0, MAX_SUGGESTIONS)

    // Prefix matches on the IATA code or city rank above substring matches
    // elsewhere (airport name, country).
    const rank = (airport: Airport): number => {
      if (normalizeText(airport.code).startsWith(normalized)) return 0
      if (normalizeText(airport.city).startsWith(normalized)) return 1
      return 2
    }
    return AIRPORTS.filter((airport) =>
      [airport.code, airport.city, airport.name, airport.country].some((field) =>
        normalizeText(field).includes(normalized),
      ),
    )
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, MAX_SUGGESTIONS)
  }, [query])

  const selectAirport = (airport: Airport) => {
    onChange(airport)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((index) => Math.min(index + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const airport = suggestions[highlighted]
      if (airport) selectAirport(airport)
    } else if (event.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const listboxId = `airport-listbox-${label}`

  return (
    <div ref={containerRef} className="relative">
      <div
        className="group flex h-full cursor-text items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition-colors hover:border-slate-300 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-600/20"
        onClick={() => inputRef.current?.focus()}
      >
        <Icon className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-focus-within:text-indigo-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-label={label}
            className="w-full truncate border-none bg-transparent p-0 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-0"
            placeholder="Cidade ou aeroporto"
            value={open ? query : `${value.city} (${value.code})`}
            onFocus={() => {
              setOpen(true)
              setQuery('')
              setHighlighted(0)
            }}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlighted(0)
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="thin-scrollbar absolute left-0 top-full z-30 mt-2 max-h-80 w-full min-w-[18rem] animate-pop overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl shadow-slate-900/10"
        >
          {suggestions.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">Nenhum aeroporto encontrado.</li>
          )}
          {suggestions.map((airport, index) => {
            const isExcluded = airport.code === excludeCode
            return (
              <li key={airport.code} role="option" aria-selected={airport.code === value.code}>
                <button
                  type="button"
                  disabled={isExcluded}
                  onClick={() => selectAirport(airport)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isExcluded
                      ? 'cursor-not-allowed opacity-40'
                      : index === highlighted
                        ? 'bg-indigo-50'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Plane className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {airport.city}
                      <span className="ml-1.5 font-normal text-slate-400">· {airport.country}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">{airport.name}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold tracking-wide text-slate-600">
                    {airport.code}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
