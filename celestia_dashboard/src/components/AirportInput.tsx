import { useId, useMemo, useRef, useState } from 'react'
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
  /** Airport shown greyed-out and unselectable (the other endpoint of the route). */
  excludeCode?: string
}

const MAX_SUGGESTIONS = 8

export function AirportInput({ label, icon: Icon, value, onChange, excludeCode }: AirportInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const generatedId = useId()

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

  const isSelectable = (index: number) =>
    index >= 0 && index < suggestions.length && suggestions[index].code !== excludeCode

  // The excluded airport is never a valid target: if the raw highlight lands
  // on it (e.g. it ranks first for the typed query), derive to the first
  // selectable option instead.
  const activeIndex = isSelectable(highlighted)
    ? highlighted
    : suggestions.findIndex((airport) => airport.code !== excludeCode)

  const selectAirport = (airport: Airport) => {
    onChange(airport)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const moveHighlight = (delta: number) => {
    let next = activeIndex + delta
    while (next >= 0 && next < suggestions.length && !isSelectable(next)) next += delta
    if (isSelectable(next)) setHighlighted(next)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const airport = suggestions[activeIndex]
      if (airport && airport.code !== excludeCode) selectAirport(airport)
    } else if (event.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const listboxId = `airport-listbox-${generatedId}`
  const optionId = (index: number) => `${listboxId}-opt-${index}`

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        const nextFocused = event.relatedTarget
        if (!(nextFocused instanceof Node) || !event.currentTarget.contains(nextFocused)) {
          setOpen(false)
        }
      }}
    >
      <div
        className="group field-shell cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        <Icon className="h-5 w-5 shrink-0 text-ink-500 transition-colors group-focus-within:text-aqua-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
            {label}
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            aria-label={label}
            className="w-full truncate border-none bg-transparent p-0 text-base font-semibold text-ink-900 placeholder:font-normal placeholder:text-ink-500 focus:outline-none focus:ring-0"
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
          tabIndex={-1}
          aria-label={`Sugestões de ${label.toLowerCase()}`}
          className="mobile-sheet popover-surface thin-scrollbar absolute left-0 top-full mt-2 max-h-80 w-full min-w-[18rem] animate-pop overflow-y-auto py-2"
        >
          {suggestions.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-500">Nenhum aeroporto encontrado.</li>
          )}
          {suggestions.map((airport, index) => {
            const isExcluded = airport.code === excludeCode
            return (
              <li
                key={airport.code}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={isExcluded || undefined}
                onMouseDown={(event) => {
                  event.preventDefault()
                  if (!isExcluded) selectAirport(airport)
                }}
                onMouseEnter={() => {
                  if (!isExcluded) setHighlighted(index)
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isExcluded
                    ? 'cursor-not-allowed opacity-40'
                    : index === activeIndex
                      ? 'cursor-pointer bg-aqua-50'
                      : 'cursor-pointer hover:bg-ink-50'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-space-50 text-space-700">
                  <Plane className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">
                    {airport.city}
                    <span className="ml-1.5 font-normal text-ink-500">· {airport.country}</span>
                  </span>
                  <span className="block truncate text-xs text-ink-500">{airport.name}</span>
                </span>
                <span className="shrink-0 rounded-md bg-space-50 px-2 py-1 text-xs font-bold tracking-wide text-space-700">
                  {airport.code}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
