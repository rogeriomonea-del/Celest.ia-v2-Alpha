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
      role="group"
      aria-label="Ordenar resultados"
      className="sort-console grid grid-cols-3 overflow-hidden rounded-2xl p-1"
    >
      {TAB_ORDER.map((key) => {
        const isActive = key === active
        const top = topByKey[key]
        return (
          <button
            key={key}
            aria-pressed={isActive}
            type="button"
            onClick={() => onChange(key)}
            className={`relative min-h-12 rounded-xl px-2 py-2.5 text-left transition-all sm:px-4 ${
              isActive
                ? 'bg-aqua-300/[0.075] text-white shadow-[inset_0_0_0_1px_rgba(85,230,230,.34),0_0_20px_rgba(47,208,212,.05)]'
                : 'text-space-100/60 hover:bg-white/[0.03]'
            }`}
          >
            <span
              className={`block text-sm font-bold ${
                isActive ? 'text-aqua-100' : 'text-space-100/70'
              }`}
            >
              {TAB_LABELS[key]}
            </span>
            <span className={`tnum mt-0.5 hidden truncate text-xs min-[420px]:block ${isActive ? 'text-gold-200/80' : 'text-space-200/40'}`}>
              {top ? `${formatBRL(top.price)} · ${formatDuration(top.durationMin)}` : '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
