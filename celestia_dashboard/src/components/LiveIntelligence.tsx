import { useId } from 'react'
import { Activity, CalendarRange, Layers3, Orbit, Route } from 'lucide-react'
import { resolveFlexWindow } from './FlexibilityToggle'
import type { ApiMode, JourneyResult, SearchParams, SearchResult } from '../types'

export interface LiveIntelligenceProps {
  apiMode: ApiMode | null
  params: SearchParams
  report: SearchResult | null
  /** Jornada multidestinos ativa — quando presente, o cartão reflete os trechos. */
  journey?: JourneyResult | null
  loading: boolean
  idle: boolean
  error: string | null
}

const SPARK_WIDTH = 264
const SPARK_HEIGHT = 42
const SPARK_PADDING = 3

const compactDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
})

function compactDate(date: Date): string {
  return compactDateFormatter.format(date).replace('.', '')
}

function flexibilitySummary(params: SearchParams): string {
  if (!params.flexibility.enabled) return '—'
  const window = resolveFlexWindow(params.flexibility, params.departDate)
  return window ? `${compactDate(window[0])} – ${compactDate(window[1])}` : '—'
}

function strategySummary(report: SearchResult | null): string {
  if (!report || report.strategies.length === 0) return '—'

  const hasCash = report.strategies.some((option) => option.cashBrl > 0 && option.miles === 0)
  const hasMiles = report.strategies.some((option) => option.miles > 0)
  const hasUpgrade = report.strategies.some((option) =>
    `${option.strategy} ${option.label}`.toLocaleLowerCase('pt-BR').includes('upgrade'),
  )
  const compared = [
    hasCash ? 'Dinheiro' : null,
    hasMiles ? 'Milhas' : null,
    hasUpgrade ? 'Upgrade' : null,
  ].filter((label): label is string => label !== null)

  return compared.length > 0
    ? compared.join(' · ')
    : `${report.strategies.length} ${report.strategies.length === 1 ? 'estratégia' : 'estratégias'}`
}

function sparkPath(values: number[]): { line: string; area: string; last: [number, number] | null } {
  if (values.length === 0) return { line: '', area: '', last: null }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min
  const usableHeight = SPARK_HEIGHT - SPARK_PADDING * 2
  const points = values.map((value, index): [number, number] => {
    const x =
      values.length === 1
        ? SPARK_WIDTH / 2
        : (index / (values.length - 1)) * SPARK_WIDTH
    const y =
      spread === 0
        ? SPARK_HEIGHT / 2
        : SPARK_PADDING + ((max - value) / spread) * usableHeight
    return [x, y]
  })
  const line = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
  const area =
    points.length > 1
      ? `${line} L ${SPARK_WIDTH} ${SPARK_HEIGHT} L 0 ${SPARK_HEIGHT} Z`
      : ''

  return { line, area, last: points[points.length - 1] ?? null }
}

export function LiveIntelligence({
  apiMode,
  params,
  report,
  journey = null,
  loading,
  idle,
  error,
}: LiveIntelligenceProps) {
  const gradientId = `intelligence-spark-${useId().replace(/:/g, '')}`
  const searchSettled = !loading && !idle && error === null
  const strategies = searchSettled ? strategySummary(report) : '—'
  const scenarios =
    searchSettled && report && Number.isFinite(report.stats.candidatesTotal)
      ? report.stats.candidatesTotal.toLocaleString('pt-BR')
      : '—'
  const flexibleWindow = searchSettled ? flexibilitySummary(params) : '—'
  const quoteValues = searchSettled
    ? (journey ? journey.legs.flatMap((leg) => leg.quotes) : (report?.quotes ?? []))
        .map((quote) => quote.priceBrl)
        .filter((price) => Number.isFinite(price) && price > 0)
    : []
  const spark = sparkPath(quoteValues)

  const activeMode = journey ? journey.mode : report?.mode
  const confidence = !searchSettled
    ? { label: '—', dots: 0 }
    : activeMode === 'real'
      ? journey?.partial
        ? { label: 'Parcial', dots: 5 }
        : { label: 'Alta', dots: 8 }
      : activeMode === 'mock' || apiMode === 'mock' || apiMode === 'off'
        ? { label: 'Simulada', dots: 4 }
        : { label: '—', dots: 0 }

  // Jornada: somente números reais do motor (trechos ok, candidatos, combinações).
  const rows = journey && searchSettled
    ? [
        {
          label: 'Trechos da jornada',
          value:
            journey.stats.legsFailed > 0 || journey.stats.legsEmpty > 0
              ? `${journey.stats.legsSucceeded} de ${journey.stats.legsTotal} ok`
              : `${journey.stats.legsTotal} trechos ok`,
          icon: Route,
        },
        {
          label: 'Cenários analisados',
          value: Number.isFinite(journey.stats.candidatesTotal)
            ? journey.stats.candidatesTotal.toLocaleString('pt-BR')
            : '—',
          icon: Orbit,
        },
        {
          label: 'Combinações',
          value: journey.itineraries.length.toLocaleString('pt-BR'),
          icon: Layers3,
        },
      ]
    : [
        { label: 'Estratégias', value: strategies, icon: Layers3 },
        { label: 'Cenários analisados', value: scenarios, icon: Orbit },
        { label: 'Janela flexível', value: flexibleWindow, icon: CalendarRange },
      ]

  return (
    <aside
      aria-labelledby="live-intelligence-title"
      className="relative w-full max-w-[20rem] overflow-hidden rounded-[0.9rem] border border-aqua-200/[0.16] bg-space-950/70 px-4 pb-3.5 pt-4 text-white shadow-[0_26px_75px_-30px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl"
    >
      <span
        aria-hidden="true"
        className="absolute -top-px right-8 h-px w-36 bg-gradient-to-r from-transparent via-aqua-200/75 to-transparent"
      />
      <header className="flex items-center gap-2.5 border-b border-white/[0.09] pb-3">
        <Activity className="h-4 w-4 text-aqua-300" strokeWidth={1.55} aria-hidden="true" />
        <h2
          id="live-intelligence-title"
          className="text-[8px] font-bold uppercase tracking-[0.27em] text-aqua-200"
        >
          Inteligência ao vivo
        </h2>
        <span
          aria-hidden="true"
          className={`ml-auto h-1.5 w-1.5 rounded-full ${
            searchSettled
              ? 'bg-gold-200 shadow-[0_0_10px_rgba(228,205,155,0.95)]'
              : 'bg-space-200/30'
          }`}
        />
      </header>

      <dl>
        {rows.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="grid min-h-[2.85rem] grid-cols-[1fr_auto] items-center gap-3 border-b border-white/[0.085] py-2"
          >
            <dt className="flex items-center gap-2 text-[11px] text-space-100/70">
              <Icon className="h-4 w-4 shrink-0 text-space-100/65" strokeWidth={1.35} aria-hidden="true" />
              {label}
            </dt>
            <dd className="max-w-[10.25rem] text-right text-[10px] font-medium tracking-[0.025em] text-aqua-200">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-2 h-12 overflow-hidden" aria-hidden="true">
        <svg
          className="h-full w-full"
          viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#55e6e6" stopOpacity="0.23" />
              <stop offset="100%" stopColor="#55e6e6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M 0 ${SPARK_HEIGHT - 3} L ${SPARK_WIDTH} ${SPARK_HEIGHT - 3}`}
            fill="none"
            stroke="rgba(145,245,244,0.2)"
            strokeDasharray="2 4"
          />
          {spark.area && <path d={spark.area} fill={`url(#${gradientId})`} />}
          {spark.line && (
            <path
              d={spark.line}
              fill="none"
              stroke="#55e6e6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.15"
            />
          )}
          {spark.last && (
            <circle cx={spark.last[0]} cy={spark.last[1]} r="2" fill="#e4cd9b" />
          )}
        </svg>
      </div>

      <div className="mt-1 flex items-center gap-2 border-t border-white/[0.08] pt-3">
        <span className="text-[7px] font-bold uppercase tracking-[0.25em] text-space-200/55">
          Confiança
        </span>
        <span className="ml-auto flex gap-1" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span
              key={index}
              className={`h-1 w-1 rounded-full ${
                index < confidence.dots
                  ? 'bg-gold-200 shadow-[0_0_6px_rgba(228,205,155,0.8)]'
                  : 'bg-space-200/15'
              }`}
            />
          ))}
        </span>
        <span className="min-w-[3.4rem] text-right text-[7px] font-bold uppercase tracking-[0.18em] text-gold-200">
          {confidence.label}
        </span>
      </div>
    </aside>
  )
}
