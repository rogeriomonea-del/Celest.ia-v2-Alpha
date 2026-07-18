import { useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { addMonths, getMonthMatrix, isBetween, isSameDay, startOfDay } from '../utils/dates'
import { formatMonthYear, formatShortDate } from '../utils/format'
import type { TripType } from '../types'

interface DateRangePickerProps {
  departDate: Date | null
  returnDate: Date | null
  tripType: TripType
  onChange: (departDate: Date | null, returnDate: Date | null) => void
}

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

interface MonthGridProps {
  viewDate: Date
  departDate: Date | null
  returnDate: Date | null
  hoverDate: Date | null
  onSelect: (date: Date) => void
  onHover: (date: Date | null) => void
}

function MonthGrid({ viewDate, departDate, returnDate, hoverDate, onSelect, onHover }: MonthGridProps) {
  const today = startOfDay(new Date())
  const weeks = getMonthMatrix(viewDate.getFullYear(), viewDate.getMonth())
  const previewEnd = returnDate ?? (departDate && hoverDate && hoverDate > departDate ? hoverDate : null)

  return (
    <div className="w-full sm:w-64">
      <p className="mb-2 text-center text-sm font-semibold text-slate-900">
        {formatMonthYear(viewDate)}
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((weekday, index) => (
          <span key={index} className="pb-1 text-xs font-medium text-slate-400">
            {weekday}
          </span>
        ))}
        {weeks.flat().map((date, index) => {
          if (!date) return <span key={index} />
          const disabled = date < today
          const isStart = isSameDay(date, departDate)
          const isEnd = isSameDay(date, returnDate)
          const inRange =
            departDate && previewEnd ? isBetween(date, departDate, previewEnd) : false
          const isPreviewEnd = !returnDate && previewEnd ? isSameDay(date, previewEnd) : false

          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : isStart || isEnd
                    ? 'bg-indigo-600 font-bold text-white shadow-sm'
                    : isPreviewEnd
                      ? 'bg-indigo-100 font-semibold text-indigo-700'
                      : inRange
                        ? 'rounded-none bg-indigo-50 text-indigo-700'
                        : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangePicker({ departDate, returnDate, tripType, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const base = departDate ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false), open)

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

  return (
    <div ref={containerRef} className="relative h-full">
      <button
        type="button"
        aria-label="Datas da viagem"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-full w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition-colors hover:border-slate-300 ${
          open ? 'border-indigo-600 ring-2 ring-indigo-600/20' : 'border-slate-200'
        }`}
      >
        <Calendar
          className={`h-5 w-5 shrink-0 ${open ? 'text-indigo-600' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 items-center">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Ida
            </span>
            <span className="block truncate text-sm font-semibold text-slate-900">
              {departDate ? formatShortDate(departDate) : 'Escolher data'}
            </span>
          </span>
          {tripType === 'roundtrip' && (
            <>
              <span className="mx-2.5 h-8 w-px shrink-0 bg-slate-200" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Volta
                </span>
                <span
                  className={`block truncate text-sm font-semibold ${
                    returnDate ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {returnDate ? formatShortDate(returnDate) : 'Escolher data'}
                </span>
              </span>
            </>
          )}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[calc(100vw-2.5rem)] max-w-xl animate-pop rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mês anterior"
              disabled={!canGoBack}
              onClick={() => setViewDate((current) => addMonths(current, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="text-xs font-medium text-slate-500">
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:justify-center">
            <MonthGrid
              viewDate={viewDate}
              departDate={departDate}
              returnDate={returnDate}
              hoverDate={hoverDate}
              onSelect={handleSelect}
              onHover={setHoverDate}
            />
            <div className="hidden sm:block">
              <MonthGrid
                viewDate={addMonths(viewDate, 1)}
                departDate={departDate}
                returnDate={returnDate}
                hoverDate={hoverDate}
                onSelect={handleSelect}
                onHover={setHoverDate}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
