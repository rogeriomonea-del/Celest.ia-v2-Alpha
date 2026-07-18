import { useRef, useState } from 'react'
import { Check, Minus, Plus, Users } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import type { CabinClass, PassengerCounts } from '../types'

interface PassengerSelectorProps {
  passengers: PassengerCounts
  cabin: CabinClass
  onPassengersChange: (passengers: PassengerCounts) => void
  onCabinChange: (cabin: CabinClass) => void
}

const MAX_TOTAL_SEATS = 9

const CABIN_LABELS: Record<CabinClass, string> = {
  economy: 'Econômica',
  premium: 'Premium Economy',
  business: 'Executiva',
}

interface StepperRowProps {
  label: string
  sublabel: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

function StepperRow({ label, sublabel, value, min, max, onChange }: StepperRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{sublabel}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:border-indigo-600 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-600"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-5 text-center text-sm font-bold text-slate-900">{value}</span>
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:border-indigo-600 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-600"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function PassengerSelector({
  passengers,
  cabin,
  onPassengersChange,
  onCabinChange,
}: PassengerSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useClickOutside(containerRef, () => setOpen(false), open)

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close()
    }
  }

  const totalSeated = passengers.adults + passengers.children
  const totalPassengers = totalSeated + passengers.infants
  const summary = `${totalPassengers} ${totalPassengers === 1 ? 'passageiro' : 'passageiros'}`

  const update = (patch: Partial<PassengerCounts>) => {
    const next = { ...passengers, ...patch }
    // Infants travel on an adult's lap: never more infants than adults.
    next.infants = Math.min(next.infants, next.adults)
    onPassengersChange(next)
  }

  return (
    <div ref={containerRef} className="relative h-full" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-full w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition-colors hover:border-slate-300 ${
          open ? 'border-indigo-600 ring-2 ring-indigo-600/20' : 'border-slate-200'
        }`}
      >
        <Users
          className={`h-5 w-5 shrink-0 ${open ? 'text-indigo-600' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Passageiros
          </span>
          <span className="block truncate text-sm font-semibold text-slate-900">
            {summary} · {CABIN_LABELS[cabin]}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-3rem))] animate-pop rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10">
          <div className="divide-y divide-slate-100">
            <StepperRow
              label="Adultos"
              sublabel="12 anos ou mais"
              value={passengers.adults}
              min={1}
              max={MAX_TOTAL_SEATS - passengers.children}
              onChange={(adults) => update({ adults })}
            />
            <StepperRow
              label="Crianças"
              sublabel="De 2 a 11 anos"
              value={passengers.children}
              min={0}
              max={MAX_TOTAL_SEATS - passengers.adults}
              onChange={(children) => update({ children })}
            />
            <StepperRow
              label="Bebês"
              sublabel="Menores de 2 anos, no colo"
              value={passengers.infants}
              min={0}
              max={passengers.adults}
              onChange={(infants) => update({ infants })}
            />
          </div>

          <div className="mt-2 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Classe da cabine
            </p>
            <div className="space-y-1">
              {(Object.keys(CABIN_LABELS) as CabinClass[]).map((cabinOption) => (
                <button
                  key={cabinOption}
                  type="button"
                  onClick={() => onCabinChange(cabinOption)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                    cabin === cabinOption
                      ? 'bg-indigo-50 font-semibold text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {CABIN_LABELS[cabinOption]}
                  {cabin === cabinOption && <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Confirmar
          </button>
        </div>
      )}
    </div>
  )
}
