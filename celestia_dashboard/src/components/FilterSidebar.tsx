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
    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-space-200/50">{children}</h3>
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
    <aside aria-label="Filtros dos resultados" className="nebula-panel filter-console space-y-0 overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="system-kicker">Console de rota</p>
          <h2 className="mt-1 font-serif text-lg font-light text-[#f5ecdd]">Parâmetros da jornada</h2>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={reset}
            className="min-h-10 rounded-full px-2 text-xs font-bold text-gold-200 transition-colors hover:bg-gold-200/[0.07]"
          >
            Limpar tudo
          </button>
        )}
      </div>

      <section className="filter-section">
        <SectionTitle>Escalas</SectionTitle>
        <div className="space-y-2">
          {STOP_OPTIONS.map((option) => {
            const minPrice = minPriceByStops(option.value)
            const count = flights.filter((flight) => stopBucket(flight) === option.value).length
            return (
              <label
                key={option.value}
                className={`filter-row flex min-h-9 items-center gap-3 text-sm ${
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
                  className="nebula-checkbox h-4 w-4 rounded"
                />
                <span className="flex-1 font-medium text-space-100/75">
                  {option.label}
                  <span className="ml-1 text-xs font-normal text-space-200/40">({count})</span>
                </span>
                {minPrice !== null && (
                  <span className="tnum text-xs font-semibold text-gold-200/80">{formatBRL(minPrice)}</span>
                )}
              </label>
            )
          })}
        </div>
      </section>

      <section className="filter-section">
        <SectionTitle>Preço máximo</SectionTitle>
        <input
          type="range"
          min={priceBounds.min}
          max={priceBounds.max}
          step={50}
          value={filters.maxPrice}
          aria-label="Preço máximo"
          onChange={(event) => onChange({ ...filters, maxPrice: Number(event.target.value) })}
          className="nebula-range w-full"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-space-200/45">
          <span>{formatBRL(priceBounds.min)}</span>
          <span className="tnum font-bold text-aqua-200">até {formatBRL(filters.maxPrice)}</span>
        </div>
      </section>

      <section className="filter-section">
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
                className={`flex min-h-[4.5rem] flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-aqua-200/50 bg-aqua-300/[0.08] text-aqua-100 shadow-[inset_0_0_18px_rgba(47,208,212,.04)]'
                    : 'border-space-100/10 bg-white/[0.015] text-space-100/70 hover:border-space-100/20 hover:bg-white/[0.035]'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                <span className="font-normal text-space-200/45">{range}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="filter-section">
        <SectionTitle>Companhias aéreas</SectionTitle>
        <div className="space-y-2.5">
          {airlines.map((airline) => {
            const minPrice = minPriceByAirline(airline.code)
            return (
              <label key={airline.code} className="filter-row flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={filters.airlines.includes(airline.code)}
                  onChange={() =>
                    onChange({ ...filters, airlines: toggleValue(filters.airlines, airline.code) })
                  }
                  className="nebula-checkbox h-4 w-4 rounded"
                />
                <AirlineLogo airline={airline} size="sm" />
                <span className="flex-1 truncate font-medium text-space-100/75">{airline.name}</span>
                {minPrice !== null && (
                  <span className="tnum shrink-0 text-xs font-semibold text-gold-200/75">
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
