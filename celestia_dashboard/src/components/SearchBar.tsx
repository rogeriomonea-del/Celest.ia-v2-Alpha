import { useState } from 'react'
import { ArrowLeftRight, PlaneLanding, PlaneTakeoff, Search } from 'lucide-react'
import { AirportInput } from './AirportInput'
import { DateRangePicker } from './DateRangePicker'
import { FlexibilityToggle } from './FlexibilityToggle'
import { PassengerSelector } from './PassengerSelector'
import type { SearchParams, TripType } from '../types'

interface SearchBarProps {
  initialParams: SearchParams
  loading: boolean
  onSearch: (params: SearchParams) => void
}

const TRIP_TYPE_LABELS: Record<TripType, string> = {
  roundtrip: 'Ida e volta',
  oneway: 'Somente ida',
}

export function SearchBar({ initialParams, loading, onSearch }: SearchBarProps) {
  const [draft, setDraft] = useState<SearchParams>(initialParams)
  const [swapCount, setSwapCount] = useState(0)

  const sameRoute = draft.origin.code === draft.destination.code
  const missingDates =
    !draft.departDate || (draft.tripType === 'roundtrip' && !draft.returnDate)
  const disabled = loading || sameRoute || missingDates

  const setTripType = (tripType: TripType) => {
    setDraft((current) => ({
      ...current,
      tripType,
      returnDate: tripType === 'oneway' ? null : current.returnDate,
    }))
  }

  const swapAirports = () => {
    setSwapCount((count) => count + 1)
    setDraft((current) => ({
      ...current,
      origin: current.destination,
      destination: current.origin,
    }))
  }

  return (
    <div className="relative rounded-2xl border border-ink-200/80 bg-white p-4 pb-9 shadow-lift sm:p-6 sm:pb-10">
      <div aria-hidden="true" className="absolute inset-x-8 top-0 h-px rounded-full hairline-gold" />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(TRIP_TYPE_LABELS) as TripType[]).map((tripType) => (
          <button
            key={tripType}
            type="button"
            aria-pressed={draft.tripType === tripType}
            onClick={() => setTripType(tripType)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              draft.tripType === tripType
                ? 'bg-ink-900 text-white shadow-card'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {TRIP_TYPE_LABELS[tripType]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_auto_1.05fr_1.5fr_1.05fr]">
        <AirportInput
          label="Origem"
          icon={PlaneTakeoff}
          value={draft.origin}
          excludeCode={draft.destination.code}
          onChange={(origin) => setDraft((current) => ({ ...current, origin }))}
        />

        <div className="flex items-center justify-center">
          <button
            type="button"
            aria-label="Inverter origem e destino"
            onClick={swapAirports}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-300 hover:border-indigo-600 hover:text-indigo-600"
            style={{ transform: `rotate(${swapCount * 180}deg)` }}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>

        <AirportInput
          label="Destino"
          icon={PlaneLanding}
          value={draft.destination}
          excludeCode={draft.origin.code}
          onChange={(destination) => setDraft((current) => ({ ...current, destination }))}
        />

        <DateRangePicker
          departDate={draft.departDate}
          returnDate={draft.returnDate}
          tripType={draft.tripType}
          onChange={(departDate, returnDate) =>
            setDraft((current) => ({ ...current, departDate, returnDate }))
          }
        />

        <PassengerSelector
          passengers={draft.passengers}
          cabin={draft.cabin}
          onPassengersChange={(passengers) =>
            setDraft((current) => ({ ...current, passengers }))
          }
          onCabinChange={(cabin) => setDraft((current) => ({ ...current, cabin }))}
        />
      </div>

      <FlexibilityToggle
        value={draft.flexibility}
        departDate={draft.departDate}
        onChange={(flexibility) => setDraft((current) => ({ ...current, flexibility }))}
      />

      {sameRoute && (
        <p className="mt-3 text-center text-sm font-medium text-red-600">
          Origem e destino não podem ser iguais.
        </p>
      )}

      <div className="absolute inset-x-0 -bottom-6 flex justify-center">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSearch(draft)}
          className="group inline-flex items-center gap-2 rounded-full bg-ink-900 px-8 py-3.5 text-sm font-semibold tracking-wide text-white shadow-lift ring-1 ring-inset ring-white/10 transition-all hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:shadow-none disabled:ring-0"
        >
          <Search className="h-4 w-4 text-gold-400 transition-transform group-hover:scale-110" aria-hidden="true" />
          {loading ? 'Buscando…' : 'Buscar voos'}
        </button>
      </div>
    </div>
  )
}
