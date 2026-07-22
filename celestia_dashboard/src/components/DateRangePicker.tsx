import { useId, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { addMonths } from '../utils/dates'
import { formatFullDate, formatShortDate } from '../utils/format'
import { MonthGrid } from './MonthGrid'
import type { TripType } from '../types'

interface DateRangePickerProps {
  departDate: Date | null
  returnDate: Date | null
  tripType: TripType
  onChange: (departDate: Date | null, returnDate: Date | null) => void
  compact?: boolean
}

function compactDate(date: Date): string {
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${String(date.getDate()).padStart(2, '0')} ${month}`
}

export function DateRangePicker({ departDate, returnDate, tripType, onChange, compact = false }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const base = departDate ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
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

  const handleSelect = (date: Date) => {
    if (tripType === 'oneway') {
      onChange(date, null)
      setOpen(false)
      return
    }
    if (!departDate || returnDate || date < departDate) {
      onChange(date, null)
    } else {
      onChange(departDate, date)
      setOpen(false)
    }
  }

  const canGoBack =
    viewDate.getFullYear() > new Date().getFullYear() ||
    (viewDate.getFullYear() === new Date().getFullYear() &&
      viewDate.getMonth() > new Date().getMonth())

  const triggerLabel = departDate
    ? `Datas da viagem: ida ${formatFullDate(departDate)}${
        tripType === 'roundtrip' && returnDate ? `, volta ${formatFullDate(returnDate)}` : ''
      }`
    : 'Selecionar datas da viagem'

  return (
    <div ref={containerRef} className="relative h-full" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={() => setOpen((current) => !current)}
        className={`field-shell ${open ? 'border-aqua-600 shadow-[0_0_0_3px_rgba(22,177,184,.12)]' : ''}`}
      >
        <Calendar
          className={`h-5 w-5 shrink-0 ${open ? 'text-aqua-700' : 'text-ink-500'}`}
          aria-hidden="true"
        />
        {compact ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Datas
            </span>
            <span className={`block truncate text-sm font-semibold ${departDate ? 'text-ink-900' : 'text-ink-500'}`}>
              {departDate
                ? `${compactDate(departDate)}${tripType === 'roundtrip' && returnDate ? ` — ${compactDate(returnDate)}` : ''}`
                : 'Escolher datas'}
            </span>
          </span>
        ) : (
        <span className="flex min-w-0 flex-1 items-center">
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Ida
            </span>
            <span
              className={`block truncate text-sm font-semibold ${
                departDate ? 'text-ink-900' : 'text-ink-500'
              }`}
            >
              {departDate ? formatShortDate(departDate) : 'Escolher data'}
            </span>
          </span>
          {tripType === 'roundtrip' && (
            <>
              <span className="mx-2.5 h-8 w-px shrink-0 bg-ink-200" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  Volta
                </span>
                <span
                  className={`block truncate text-sm font-semibold ${
                    returnDate ? 'text-ink-900' : 'text-ink-500'
                  }`}
                >
                  {returnDate ? formatShortDate(returnDate) : 'Escolher data'}
                </span>
              </span>
            </>
          )}
        </span>
        )}
      </button>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Selecionar datas da viagem"
          className="mobile-sheet popover-surface absolute left-0 top-full mt-2 w-[min(36rem,calc(100vw-2rem))] animate-pop p-4 sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mês anterior"
              disabled={!canGoBack}
              onClick={() => setViewDate((current) => addMonths(current, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="text-xs font-semibold text-ink-600">
              {tripType === 'roundtrip'
                ? !departDate || returnDate
                  ? 'Selecione a data de ida'
                  : 'Agora selecione a data de volta'
                : 'Selecione a data da viagem'}
            </p>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setViewDate((current) => addMonths(current, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:justify-center">
            <MonthGrid
              viewDate={viewDate}
              startDate={departDate}
              endDate={returnDate}
              hoverDate={hoverDate}
              onSelect={handleSelect}
              onHover={setHoverDate}
            />
            <div className="hidden sm:block">
              <MonthGrid
                viewDate={addMonths(viewDate, 1)}
                startDate={departDate}
                endDate={returnDate}
                hoverDate={hoverDate}
                onSelect={handleSelect}
                onHover={setHoverDate}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="min-h-11 px-2 text-sm font-semibold text-ink-600 transition-colors hover:text-ink-900"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={close}
              className="primary-button px-5 py-2"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
