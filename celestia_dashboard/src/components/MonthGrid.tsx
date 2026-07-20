import { getMonthMatrix, isBetween, isSameDay, startOfDay } from '../utils/dates'
import { formatFullDate, formatMonthYear } from '../utils/format'

const WEEKDAYS = [
  { short: 'D', full: 'domingo' },
  { short: 'S', full: 'segunda-feira' },
  { short: 'T', full: 'terça-feira' },
  { short: 'Q', full: 'quarta-feira' },
  { short: 'Q', full: 'quinta-feira' },
  { short: 'S', full: 'sexta-feira' },
  { short: 'S', full: 'sábado' },
]

interface MonthGridProps {
  viewDate: Date
  /** Range start (departure, or the custom-window start). */
  startDate: Date | null
  /** Range end (return, or the custom-window end). */
  endDate: Date | null
  hoverDate: Date | null
  onSelect: (date: Date) => void
  onHover: (date: Date | null) => void
}

/**
 * A single month of selectable days with range-highlight preview. Shared by the
 * trip DateRangePicker and the flexibility custom-window picker so both behave
 * identically (pick start, hover previews the range, pick end).
 */
export function MonthGrid({
  viewDate,
  startDate,
  endDate,
  hoverDate,
  onSelect,
  onHover,
}: MonthGridProps) {
  const today = startOfDay(new Date())
  const weeks = getMonthMatrix(viewDate.getFullYear(), viewDate.getMonth())
  const previewEnd = endDate ?? (startDate && hoverDate && hoverDate > startDate ? hoverDate : null)

  return (
    <div className="w-full sm:w-64">
      <p className="mb-2 text-center text-sm font-semibold text-slate-900">
        {formatMonthYear(viewDate)}
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((weekday, index) => (
          <span key={index} className="pb-1 text-xs font-medium text-slate-500">
            <span aria-hidden="true">{weekday.short}</span>
            <span className="sr-only">{weekday.full}</span>
          </span>
        ))}
        {weeks.flat().map((date, index) => {
          if (!date) return <span key={index} />
          const disabled = date < today
          const isStart = isSameDay(date, startDate)
          const isEnd = isSameDay(date, endDate)
          const inRange =
            startDate && previewEnd ? isBetween(date, startDate, previewEnd) : false
          const isPreviewEnd = !endDate && previewEnd ? isSameDay(date, previewEnd) : false

          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              aria-label={formatFullDate(date)}
              aria-pressed={isStart || isEnd}
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
