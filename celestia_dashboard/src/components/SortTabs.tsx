import { formatBRL, formatDuration } from '../utils/format'
import type { Flight, SortKey } from '../types'

interface SortTabsProps {
  /** Top flight for each sort mode, used for the tab summaries. */
  topByKey: Record<SortKey, Flight | null>
  active: SortKey
  onChange: (key: SortKey) => void
}

const TAB_LABELS: Record<SortKey, string> = {
  best: 'Melhor',
  cheapest: 'Mais barato',
  fastest: 'Mais rápido',
}

const TAB_ORDER: SortKey[] = ['best', 'cheapest', 'fastest']

export function SortTabs({ topByKey, active, onChange }: SortTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Ordenar resultados"
      className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {TAB_ORDER.map((key) => {
        const isActive = key === active
        const top = topByKey[key]
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(key)}
            className={`border-b-2 px-3 py-3 text-left transition-colors sm:px-5 ${
              isActive
                ? 'border-indigo-600 bg-indigo-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span
              className={`block text-sm font-bold ${
                isActive ? 'text-indigo-700' : 'text-slate-700'
              }`}
            >
              {TAB_LABELS[key]}
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {top ? `${formatBRL(top.price)} · ${formatDuration(top.durationMin)}` : '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
