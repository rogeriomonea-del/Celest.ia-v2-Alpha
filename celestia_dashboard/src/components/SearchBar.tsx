import { useState } from 'react'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  LoaderCircle,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { AirportInput } from './AirportInput'
import { DateRangePicker } from './DateRangePicker'
import { FlexibilityToggle } from './FlexibilityToggle'
import { PassengerSelector } from './PassengerSelector'
import type { ApiMode, SearchLeg, SearchParams, TripType } from '../types'

interface SearchBarProps {
  initialParams: SearchParams
  loading: boolean
  apiMode: ApiMode | null
  onSearch: (params: SearchParams) => void
}

const TRIP_TYPE_LABELS: Record<TripType, string> = {
  roundtrip: 'Ida e volta',
  oneway: 'Somente ida',
  multicity: 'Multidestinos',
}

const MAX_LEGS = 6
const MIN_LEGS = 2

/** Trechos iniciais ao entrar no modo multidestinos: rota atual + volta. */
function seedLegs(params: SearchParams): SearchLeg[] {
  if (params.legs.length >= MIN_LEGS) return params.legs
  return [
    {
      origin: params.origin,
      destination: params.destination,
      departDate: params.departDate,
    },
    {
      origin: params.destination,
      destination: params.origin,
      departDate: params.returnDate,
    },
  ]
}

/** Erro de validação da jornada, em pt-BR; null = pronta para buscar. */
function journeyError(legs: SearchLeg[]): string | null {
  if (legs.length < MIN_LEGS || legs.length > MAX_LEGS) {
    return `A jornada deve ter entre ${MIN_LEGS} e ${MAX_LEGS} trechos.`
  }
  const seen = new Set<string>()
  let previous: Date | null = null
  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index]
    if (leg.origin.code === leg.destination.code) {
      return `Trecho ${index + 1}: origem e destino precisam ser diferentes.`
    }
    if (!leg.departDate) {
      return `Trecho ${index + 1}: escolha a data.`
    }
    if (previous && leg.departDate.getTime() <= previous.getTime()) {
      return `Trecho ${index + 1}: as datas devem ser crescentes.`
    }
    previous = leg.departDate
    const key = `${leg.origin.code}-${leg.destination.code}-${leg.departDate.toDateString()}`
    if (seen.has(key)) {
      return `Trecho ${index + 1}: trecho duplicado na jornada.`
    }
    seen.add(key)
  }
  return null
}

export function SearchBar({ initialParams, loading, apiMode, onSearch }: SearchBarProps) {
  const [draft, setDraft] = useState<SearchParams>(initialParams)
  const [swapCount, setSwapCount] = useState(0)

  const isJourney = draft.tripType === 'multicity'
  const sameRoute = !isJourney && draft.origin.code === draft.destination.code
  const missingDates =
    !isJourney && (!draft.departDate || (draft.tripType === 'roundtrip' && !draft.returnDate))
  const invalidCustomWindow =
    draft.flexibility.enabled &&
    draft.flexibility.preset === 'custom' &&
    (!draft.flexibility.windowStart || !draft.flexibility.windowEnd)
  const legsError = isJourney ? journeyError(draft.legs) : null
  const disabled =
    loading || sameRoute || missingDates || invalidCustomWindow || legsError !== null

  const setTripType = (tripType: TripType) => {
    setDraft((current) => ({
      ...current,
      tripType,
      returnDate: tripType === 'oneway' ? null : current.returnDate,
      legs: tripType === 'multicity' ? seedLegs(current) : current.legs,
    }))
  }

  const updateLeg = (index: number, patch: Partial<SearchLeg>) => {
    setDraft((current) => ({
      ...current,
      legs: current.legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    }))
  }

  const addLeg = () => {
    setDraft((current) => {
      if (current.legs.length >= MAX_LEGS) return current
      const previous = current.legs[current.legs.length - 1]
      // a próxima origem nasce do destino anterior; editável para open-jaw
      return {
        ...current,
        legs: [
          ...current.legs,
          { origin: previous.destination, destination: previous.origin, departDate: null },
        ],
      }
    })
  }

  const removeLeg = (index: number) => {
    setDraft((current) => {
      if (current.legs.length <= MIN_LEGS) return current
      return { ...current, legs: current.legs.filter((_, i) => i !== index) }
    })
  }

  const moveLeg = (index: number, delta: -1 | 1) => {
    setDraft((current) => {
      const target = index + delta
      if (target < 0 || target >= current.legs.length) return current
      const legs = [...current.legs]
      const [moved] = legs.splice(index, 1)
      legs.splice(target, 0, moved)
      return { ...current, legs }
    })
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
    <form
      id="buscar"
      role="search"
      aria-label="Buscar voos e estratégias de compra"
      aria-describedby={sameRoute ? 'route-error' : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled) onSearch(draft)
      }}
      className="cockpit-search relative"
    >
      <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2" aria-label="Tipo de viagem">
          {(Object.keys(TRIP_TYPE_LABELS) as TripType[]).map((tripType) => (
            <button
              key={tripType}
              type="button"
              aria-pressed={draft.tripType === tripType}
              onClick={() => setTripType(tripType)}
              className={`min-h-8 rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.11em] transition-colors ${
                draft.tripType === tripType
                  ? 'border-aqua-300/40 bg-aqua-300/10 text-aqua-200 shadow-[0_0_18px_rgba(85,230,230,.08)]'
                  : 'border-white/10 bg-white/[0.025] text-space-200 hover:border-white/20 hover:text-white'
              }`}
            >
              {TRIP_TYPE_LABELS[tripType]}
            </button>
          ))}
        </div>
        <p className="inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-space-200/70">
          <Sparkles className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
          Console de trajetória
        </p>
      </div>

      {isJourney && (
        <div className="overflow-visible rounded-2xl border border-aqua-200/20 bg-space-950/75 shadow-[0_22px_60px_-30px_rgba(0,0,0,.95),0_0_26px_rgba(38,210,218,.06)] backdrop-blur-xl">
          <ul aria-label="Trechos da jornada" className="divide-y divide-white/[0.07]">
            {draft.legs.map((leg, index) => (
              <li
                key={`${index}-${leg.origin.code}-${leg.destination.code}`}
                className="grid grid-cols-1 gap-2 p-2.5 sm:p-3 lg:grid-cols-[2.5rem_minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(11.5rem,.85fr)_auto] lg:items-center lg:gap-3"
              >
                <span
                  aria-hidden="true"
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-aqua-200/30 font-mono text-xs font-bold text-aqua-200 lg:flex"
                >
                  {index + 1}
                </span>
                <div className="cockpit-segment !border-0">
                  <AirportInput
                    label={`Origem ${index + 1}`}
                    icon={PlaneTakeoff}
                    value={leg.origin}
                    excludeCode={leg.destination.code}
                    onChange={(origin) => updateLeg(index, { origin })}
                  />
                </div>
                <div className="cockpit-segment !border-0">
                  <AirportInput
                    label={`Destino ${index + 1}`}
                    icon={PlaneLanding}
                    value={leg.destination}
                    excludeCode={leg.origin.code}
                    onChange={(destination) => updateLeg(index, { destination })}
                  />
                </div>
                <div className="cockpit-segment !border-0">
                  <DateRangePicker
                    compact
                    departDate={leg.departDate}
                    returnDate={null}
                    tripType="oneway"
                    onChange={(departDate) => updateLeg(index, { departDate })}
                  />
                </div>
                <div className="flex items-center justify-end gap-1 pr-1">
                  <button
                    type="button"
                    aria-label={`Subir trecho ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => moveLeg(index, -1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-space-200 transition-colors hover:bg-white/[0.06] hover:text-aqua-200 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer trecho ${index + 1}`}
                    disabled={index === draft.legs.length - 1}
                    onClick={() => moveLeg(index, 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-space-200 transition-colors hover:bg-white/[0.06] hover:text-aqua-200 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover trecho ${index + 1}`}
                    disabled={draft.legs.length <= MIN_LEGS}
                    onClick={() => removeLeg(index)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-space-200 transition-colors hover:bg-red-400/15 hover:text-red-300 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-white/[0.09] p-2.5 sm:flex-row sm:items-center sm:justify-between sm:p-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addLeg}
                disabled={draft.legs.length >= MAX_LEGS}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-aqua-200/40 px-4 text-xs font-bold uppercase tracking-[0.12em] text-aqua-200 transition-colors hover:bg-aqua-300/[0.09] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adicionar trecho
              </button>
              <div className="cockpit-segment !min-h-0 !border-0 !p-0">
                <PassengerSelector
                  compact
                  passengers={draft.passengers}
                  cabin={draft.cabin}
                  onPassengersChange={(passengers) =>
                    setDraft((current) => ({ ...current, passengers }))
                  }
                  onCabinChange={(cabin) => setDraft((current) => ({ ...current, cabin }))}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={disabled}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-aqua-200/60 bg-aqua-300/[0.07] px-6 text-sm font-semibold text-aqua-100 shadow-[0_0_0_1px_rgba(85,230,230,.08),0_0_26px_rgba(47,208,212,.2)] transition-all hover:border-aqua-200 hover:bg-aqua-300/[0.13] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              )}
              {loading ? 'Analisando jornada…' : 'Buscar jornada'}
            </button>
          </div>
        </div>
      )}

      {!isJourney && (
      <div className="cockpit-main grid grid-cols-1 overflow-visible rounded-2xl border border-aqua-200/20 bg-space-950/75 shadow-[0_22px_60px_-30px_rgba(0,0,0,.95),0_0_26px_rgba(38,210,218,.06)] backdrop-blur-xl lg:grid-cols-[minmax(0,1.25fr)_3.25rem_minmax(0,1.15fr)_minmax(13rem,.95fr)_minmax(12rem,.9fr)_4.75rem] lg:items-stretch">
        <div className="cockpit-segment">
          <AirportInput
            label="De"
            icon={PlaneTakeoff}
            value={draft.origin}
            excludeCode={draft.destination.code}
            onChange={(origin) => setDraft((current) => ({ ...current, origin }))}
          />
        </div>

        <div className="relative z-10 flex h-12 items-center justify-center border-y border-white/[0.07] bg-space-950/50 lg:h-auto lg:border-y-0 lg:border-r lg:border-white/[0.09]">
          <button
            type="button"
            aria-label="Inverter origem e destino"
            onClick={swapAirports}
            className="flex h-9 w-9 items-center justify-center rounded-full text-space-200 transition-all duration-300 hover:bg-white/[0.05] hover:text-aqua-200"
            style={{ transform: `rotate(${swapCount * 180}deg)` }}
          >
            <ArrowLeftRight className="h-4 w-4 rotate-90 lg:rotate-0" aria-hidden="true" />
          </button>
        </div>

        <div className="cockpit-segment cockpit-destination">
          <AirportInput
            label="Para"
            icon={PlaneLanding}
            value={draft.destination}
            excludeCode={draft.origin.code}
            onChange={(destination) => setDraft((current) => ({ ...current, destination }))}
          />
        </div>

        <div className="cockpit-segment">
          <DateRangePicker
            compact
            departDate={draft.departDate}
            returnDate={draft.returnDate}
            tripType={draft.tripType}
            onChange={(departDate, returnDate) =>
              setDraft((current) => ({ ...current, departDate, returnDate }))
            }
          />
        </div>

        <div className="cockpit-segment">
          <PassengerSelector
            compact
            passengers={draft.passengers}
            cabin={draft.cabin}
            onPassengersChange={(passengers) =>
              setDraft((current) => ({ ...current, passengers }))
            }
            onCabinChange={(cabin) => setDraft((current) => ({ ...current, cabin }))}
          />
        </div>

        <div className="flex min-h-[4.75rem] items-center justify-center p-2">
          <button
            type="submit"
            disabled={disabled}
            aria-label={loading ? 'Analisando rota' : 'Buscar voos'}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-aqua-200/60 bg-aqua-300/[0.07] px-4 text-sm font-semibold text-aqua-100 shadow-[0_0_0_1px_rgba(85,230,230,.08),0_0_26px_rgba(47,208,212,.2)] transition-all hover:border-aqua-200 hover:bg-aqua-300/[0.13] disabled:cursor-not-allowed disabled:opacity-40 lg:h-12 lg:w-12 lg:rounded-full lg:px-0"
          >
            {loading ? (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            )}
            <span className="lg:sr-only">{loading ? 'Analisando rota…' : 'Buscar voos'}</span>
          </button>
        </div>
      </div>
      )}

      <div className="cockpit-utility mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="cockpit-flex">
          <FlexibilityToggle
            value={draft.flexibility}
            departDate={isJourney ? (draft.legs[0]?.departDate ?? null) : draft.departDate}
            onChange={(flexibility) => setDraft((current) => ({ ...current, flexibility }))}
          />
          {isJourney && draft.flexibility.enabled && (
            <p className="mt-1 text-[10px] leading-relaxed text-space-200/60">
              A flexibilidade vale para o 1º trecho e é recortada para manter as
              datas da jornada em ordem.
            </p>
          )}
        </div>
        <p className="max-w-md pt-2 text-right text-[9px] leading-relaxed text-space-200/55 max-sm:text-left">
          {apiMode === 'real'
            ? 'A varredura real começa somente após sua confirmação.'
            : 'Demonstração segura com dados locais.'}
        </p>
      </div>

      {sameRoute && (
        <p id="route-error" role="alert" className="mt-2 text-xs font-semibold text-red-300">
          Origem e destino precisam ser diferentes.
        </p>
      )}
      {legsError && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-300">
          {legsError}
        </p>
      )}
    </form>
  )
}
