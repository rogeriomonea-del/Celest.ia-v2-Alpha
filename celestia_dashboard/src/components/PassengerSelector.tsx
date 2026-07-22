import { useId, useRef, useState } from 'react'
import { Check, Minus, Plus, Users } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import type { CabinClass, PassengerCounts } from '../types'

interface PassengerSelectorProps {
  passengers: PassengerCounts
  cabin: CabinClass
  onPassengersChange: (passengers: PassengerCounts) => void
  onCabinChange: (cabin: CabinClass) => void
  compact?: boolean
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
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <p className="text-xs text-ink-500">{sublabel}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-300 text-ink-700 transition-colors hover:border-aqua-600 hover:text-aqua-800 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="tnum w-5 text-center text-sm font-bold text-ink-900">{value}</span>
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-300 text-ink-700 transition-colors hover:border-aqua-600 hover:text-aqua-800 disabled:cursor-not-allowed disabled:opacity-30"
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
  compact = false,
}: PassengerSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogId = useId()

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
  const compactCabin: Record<CabinClass, string> = {
    economy: 'Eco',
    premium: 'Premium',
    business: 'Executiva',
  }

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
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={() => setOpen((current) => !current)}
        className={`field-shell ${open ? 'border-aqua-600 shadow-[0_0_0_3px_rgba(22,177,184,.12)]' : ''}`}
      >
        <Users
          className={`h-5 w-5 shrink-0 ${open ? 'text-aqua-700' : 'text-ink-500'}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
            {compact ? 'Viajantes' : 'Passageiros'}
          </span>
          <span className="block truncate text-sm font-semibold text-ink-900">
            {summary} · {compact ? compactCabin[cabin] : CABIN_LABELS[cabin]}
          </span>
        </span>
      </button>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Passageiros e classe da cabine"
          className="mobile-sheet popover-surface absolute right-0 top-full mt-2 w-[min(21rem,calc(100vw-2rem))] animate-pop p-4"
        >
          <div className="divide-y divide-ink-100">
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

          <div className="mt-2 border-t border-ink-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
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
                      ? 'bg-aqua-50 font-semibold text-aqua-800'
                      : 'text-ink-700 hover:bg-ink-50'
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
            className="primary-button mt-3 w-full"
          >
            Confirmar
          </button>
        </div>
      )}
    </div>
  )
}
