import { Award, Coins, CreditCard, TrendingUp } from 'lucide-react'
import { formatBRL } from '../utils/format'
import type { EngineOption } from '../api'

interface StrategyPanelProps {
  options: EngineOption[]
}

const CABIN_LABEL: Record<string, string> = {
  economy: 'Econômica',
  premium: 'Premium',
  business: 'Executiva',
}

const STRATEGY_ICON: Record<string, typeof CreditCard> = {
  business_cash: CreditCard,
  full_miles: Award,
  economy_miles_upgrade: TrendingUp,
  economy_cash_upgrade: Coins,
}

/**
 * As estratégias de compra calculadas pelo motor (MilesMathAgent): executiva
 * em dinheiro, emissão em milhas, econômica + upgrade (milhas ou dinheiro) —
 * ranqueadas pelo custo efetivo em R$.
 */
export function StrategyPanel({ options }: StrategyPanelProps) {
  if (options.length === 0) return null
  const top = options.slice(0, 4)

  return (
    <section
      aria-label="Estratégias de compra"
      className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-4 shadow-card sm:p-5"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px hairline-gold" />
      <div className="mb-4 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
          Como comprar mais barato
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {top.map((option, index) => {
          const Icon = STRATEGY_ICON[option.strategy] ?? CreditCard
          const best = index === 0
          return (
            <div
              key={option.strategy + option.offerKey}
              className={`relative rounded-xl border p-3.5 transition-colors ${
                best
                  ? 'border-gold-300 bg-gold-50/70 ring-1 ring-gold-500/25'
                  : 'border-ink-200 bg-ink-50/60'
              }`}
            >
              {best && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-gold-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  Melhor opção
                </span>
              )}
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 shrink-0 ${best ? 'text-gold-600' : 'text-ink-400'}`}
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold leading-tight text-ink-700">
                  {option.label}
                </p>
              </div>
              <p className="tnum mt-2 font-serif text-xl font-semibold text-ink-900">
                {formatBRL(Math.round(option.effectiveTotalBrl))}
              </p>
              <p className="tnum text-[11px] text-ink-500">
                {option.miles > 0
                  ? `${option.miles.toLocaleString('pt-BR')} milhas + ${formatBRL(Math.round(option.cashBrl))}`
                  : 'tudo em dinheiro'}
                {' · '}
                {CABIN_LABEL[option.cabinFinal] ?? option.cabinFinal}
              </p>
              {option.milheiroBrl !== null && option.miles > 0 && (
                <p className="tnum mt-1 text-[11px] text-ink-400">
                  milheiro considerado: {formatBRL(option.milheiroBrl)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
