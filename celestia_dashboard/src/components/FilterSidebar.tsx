import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react'
import { AirlineLogo } from './AirlineLogo'
import { formatBRL } from '../utils/format'
import type { Airline, DepartureWindow, Filters, Flight } from '../types'

interface FilterSidebarProps {
  /** Unfiltered result set, used for counts and minimum prices per option. */
  flights: Flight[]
  filters: Filters
  priceBounds: { min: number; max: number }
  onChange: (filters: Filters) => void
}

const STOP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Direto' },
  { value: 1, label: '1 escala' },
  { value: 2, label: '2+ escalas' },
]

const WINDOW_OPTIONS: { value: DepartureWindow; label: string; range: string; icon: LucideIcon }[] = [
  { value: 'early', label: 'Madrugada', range: '00h – 06h', icon: Moon },
  { value: 'morning', label: 'Manhã', range: '06h – 12h', icon: Sunrise },
  { value: 'afternoon', label: 'Tarde', range: '12h – 18h', icon: Sun },
  { value: 'evening', label: 'Noite', range: '18h – 24h', icon: Sunset },
]

export function getDepartureWindow(time: string): DepartureWindow {
  const hour = Number(time.split(':')[0])
  if (hour < 6) return 'early'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** Stop counts are bucketed as 0, 1 and "2+" (represented by 2). */
export function stopBucket(flight: Flight): number {
  return Math.min(flight.stops.length, 2)
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">{children}</h3>
  )
}

export function FilterSidebar({ flights, filters, priceBounds, onChange }: FilterSidebarProps) {
  const airlines = [...new Map(flights.map((flight) => [flight.airline.code, flight.airline])).values()].sort(
    (a: Airline, b: Airline) => a.name.localeCompare(b.name),
  )

  const minPriceByStops = (bucket: number) => {
    const prices = flights.filter((flight) => stopBucket(flight) === bucket).map((f) => f.price)
    return prices.length > 0 ? Math.min(...prices) : null
  }

  const minPriceByAirline = (code: string) => {
    const prices = flights.filter((flight) => flight.airline.code === code).map((f) => f.price)
    return prices.length > 0 ? Math.min(...prices) : null
  }

  const allStops = STOP_OPTIONS.map((option) => option.value)
  const allAirlines = airlines.map((airline) => airline.code)
  const hasActiveFilters =
    filters.stops.length !== allStops.length ||
    filters.airlines.length !== allAirlines.length ||
    filters.maxPrice !== priceBounds.max ||
    filters.departureWindows.length > 0

  const reset = () =>
    onChange({
      stops: allStops,
      airlines: allAirlines,
      maxPrice: priceBounds.max,
      departureWindows: [],
    })

  return (
    <aside className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Filtros</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
          >
            Limpar tudo
          </button>
        )}
      </div>

      <section>
        <SectionTitle>Escalas</SectionTitle>
        <div className="space-y-2">
          {STOP_OPTIONS.map((option) => {
            const minPrice = minPriceByStops(option.value)
            const count = flights.filter((flight) => stopBucket(flight) === option.value).length
            return (
              <label
                key={option.value}
                className={`flex items-center gap-3 text-sm ${
                  count === 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={count === 0}
                  checked={filters.stops.includes(option.value)}
                  onChange={() =>
                    onChange({ ...filters, stops: toggleValue(filters.stops, option.value) })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-indigo-600"
                />
                <span className="flex-1 font-medium text-slate-700">
                  {option.label}
                  <span className="ml-1 text-xs font-normal text-slate-400">({count})</span>
                </span>
                {minPrice !== null && (
                  <span className="text-xs font-semibold text-slate-500">{formatBRL(minPrice)}</span>
                )}
              </label>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle>Preço máximo</SectionTitle>
        <input
          type="range"
          min={priceBounds.min}
          max={priceBounds.max}
          step={50}
          value={filters.maxPrice}
          aria-label="Preço máximo"
          onChange={(event) => onChange({ ...filters, maxPrice: Number(event.target.value) })}
          className="w-full accent-indigo-600"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{formatBRL(priceBounds.min)}</span>
          <span className="font-bold text-indigo-600">até {formatBRL(filters.maxPrice)}</span>
        </div>
      </section>

      <section>
        <SectionTitle>Horário de partida</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {WINDOW_OPTIONS.map(({ value, label, range, icon: Icon }) => {
            const isActive = filters.departureWindows.includes(value)
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() =>
                  onChange({
                    ...filters,
                    departureWindows: toggleValue(filters.departureWindows, value),
                  })
                }
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                <span className="font-normal text-slate-400">{range}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle>Companhias aéreas</SectionTitle>
        <div className="space-y-2.5">
          {airlines.map((airline) => {
            const minPrice = minPriceByAirline(airline.code)
            return (
              <label key={airline.code} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={filters.airlines.includes(airline.code)}
                  onChange={() =>
                    onChange({ ...filters, airlines: toggleValue(filters.airlines, airline.code) })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-indigo-600"
                />
                <AirlineLogo airline={airline} size="sm" />
                <span className="flex-1 truncate font-medium text-slate-700">{airline.name}</span>
                {minPrice !== null && (
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {formatBRL(minPrice)}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </section>
    </aside>
  )
}
