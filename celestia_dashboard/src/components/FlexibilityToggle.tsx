import { useId, useRef, useState } from 'react'
import { CalendarRange, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { addDays, addMonths } from '../utils/dates'
import { formatShortDate } from '../utils/format'
import { MonthGrid } from './MonthGrid'
import type { Flexibility, FlexPreset } from '../types'

interface FlexibilityToggleProps {
  value: Flexibility
  /** Anchor date the ± presets expand around. */
  departDate: Date | null
  onChange: (flexibility: Flexibility) => void
}

/** Radius, in days, each preset expands around the departure date. Mirrors the
 * engine's `FLEX_PRESETS` (celestia_engine/models.py). */
const FLEX_RADIUS_DAYS: Record<Exclude<FlexPreset, 'custom'>, number> = {
  '1w': 7,
  '2w': 14,
  '3w': 21,
  '1m': 30,
}

const PRESET_OPTIONS: { preset: FlexPreset; label: string }[] = [
  { preset: '1w', label: '± 1 semana' },
  { preset: '2w', label: '± 2 semanas' },
  { preset: '3w', label: '± 3 semanas' },
  { preset: '1m', label: '± 1 mês' },
  { preset: 'custom', label: 'Selecionar outro período' },
]

/** Resolves the concrete window a flexibility setting covers, or null if it
 * cannot be resolved yet (no departure date, or custom range still open). */
export function resolveFlexWindow(
  flexibility: Flexibility,
  departDate: Date | null,
): [Date, Date] | null {
  if (flexibility.preset === 'custom') {
    const { windowStart, windowEnd } = flexibility
    if (!windowStart || !windowEnd) return null
    return windowStart <= windowEnd ? [windowStart, windowEnd] : [windowEnd, windowStart]
  }
  if (!departDate) return null
  const radius = FLEX_RADIUS_DAYS[flexibility.preset]
  return [addDays(departDate, -radius), addDays(departDate, radius)]
}

export function FlexibilityToggle({ value, departDate, onChange }: FlexibilityToggleProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const [viewDate, setViewDate] = useState(
    () => new Date((departDate ?? new Date()).getFullYear(), (departDate ?? new Date()).getMonth(), 1),
  )
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const customRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()

  useClickOutside(customRef, () => setCustomOpen(false), customOpen)

  const toggleEnabled = () => {
    if (value.enabled) {
      onChange({ ...value, enabled: false })
      setCustomOpen(false)
    } else {
      onChange({ ...value, enabled: true })
    }
  }

  const selectPreset = (preset: FlexPreset) => {
    onChange({
      ...value,
      enabled: true,
      preset,
      windowStart: preset === 'custom' ? value.windowStart : null,
      windowEnd: preset === 'custom' ? value.windowEnd : null,
    })
    setCustomOpen(preset === 'custom')
  }

  const now = new Date()
  const canGoBack =
    viewDate.getFullYear() > now.getFullYear() ||
    (viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() > now.getMonth())

  const handleCustomSelect = (date: Date) => {
    const { windowStart, windowEnd } = value
    if (!windowStart || windowEnd || date < windowStart) {
      onChange({ ...value, enabled: true, preset: 'custom', windowStart: date, windowEnd: null })
    } else {
      onChange({ ...value, enabled: true, preset: 'custom', windowStart, windowEnd: date })
      setCustomOpen(false)
    }
  }

  const flexWindow = resolveFlexWindow(value, departDate)
  const windowLabel = flexWindow
    ? `Vamos varrer o calendário de ${formatShortDate(flexWindow[0])} a ${formatShortDate(flexWindow[1])} e manter as datas mais baratas.`
    : value.preset === 'custom'
      ? 'Escolha o início e o fim do período que você aceita voar.'
      : 'Selecione uma data de ida para calcular o período.'

  return (
    <div className="mt-4">
      <button
        type="button"
        role="switch"
        aria-checked={value.enabled}
        onClick={toggleEnabled}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
          value.enabled
            ? 'border-aqua-600 bg-aqua-50 text-aqua-900'
            : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
        }`}
      >
        <span
          className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
            value.enabled ? 'bg-aqua-600' : 'bg-ink-300'
          }`}
          aria-hidden="true"
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              value.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        Tenho flexibilidade nas datas
      </button>

      {value.enabled && (
        <div className="mt-3 rounded-xl border border-aqua-100 bg-aqua-50/45 p-3.5">
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((option) => {
              const active = value.preset === option.preset
              return (
                <button
                  key={option.preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectPreset(option.preset)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-space-900 text-white shadow-sm'
                      : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:ring-aqua-400'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {option.label}
                </button>
              )
            })}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-aqua-900">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{windowLabel}</span>
          </p>

          {value.preset === 'custom' && (
            <div
              ref={customRef}
              className="relative"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && customOpen) {
                  event.stopPropagation()
                  setCustomOpen(false)
                }
              }}
            >
              <button
                type="button"
                aria-expanded={customOpen}
                aria-haspopup="dialog"
                aria-controls={dialogId}
                onClick={() => setCustomOpen((current) => !current)}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-aqua-400"
              >
                <CalendarRange className="h-4 w-4 text-aqua-700" aria-hidden="true" />
                {value.windowStart && value.windowEnd
                  ? `${formatShortDate(value.windowStart)} – ${formatShortDate(value.windowEnd)}`
                  : value.windowStart
                    ? `${formatShortDate(value.windowStart)} – selecione o fim`
                    : 'Selecionar período'}
              </button>

              {customOpen && (
                <div
                  id={dialogId}
                  role="dialog"
                  aria-label="Selecionar período flexível"
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
                      {!value.windowStart || value.windowEnd
                        ? 'Selecione o início do período'
                        : 'Agora selecione o fim do período'}
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
                      startDate={value.windowStart}
                      endDate={value.windowEnd}
                      hoverDate={hoverDate}
                      onSelect={handleCustomSelect}
                      onHover={setHoverDate}
                    />
                    <div className="hidden sm:block">
                      <MonthGrid
                        viewDate={addMonths(viewDate, 1)}
                        startDate={value.windowStart}
                        endDate={value.windowEnd}
                        hoverDate={hoverDate}
                        onSelect={handleCustomSelect}
                        onHover={setHoverDate}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...value, windowStart: null, windowEnd: null })
                      }
                      className="min-h-11 px-2 text-sm font-semibold text-ink-600 transition-colors hover:text-ink-900"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomOpen(false)}
                      className="primary-button px-5 py-2"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
