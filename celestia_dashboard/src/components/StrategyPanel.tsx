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
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
        Como comprar mais barato
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {top.map((option, index) => {
          const Icon = STRATEGY_ICON[option.strategy] ?? CreditCard
          const best = index === 0
          return (
            <div
              key={option.strategy + option.offerKey}
              className={`relative rounded-xl border p-3.5 ${
                best
                  ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600/30'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              {best && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Melhor opção
                </span>
              )}
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 shrink-0 ${best ? 'text-indigo-600' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold leading-tight text-slate-700">
                  {option.label}
                </p>
              </div>
              <p className="mt-2 text-lg font-extrabold text-slate-900">
                {formatBRL(Math.round(option.effectiveTotalBrl))}
              </p>
              <p className="text-[11px] text-slate-500">
                {option.miles > 0
                  ? `${option.miles.toLocaleString('pt-BR')} milhas + ${formatBRL(Math.round(option.cashBrl))}`
                  : 'tudo em dinheiro'}
                {' · '}
                {CABIN_LABEL[option.cabinFinal] ?? option.cabinFinal}
              </p>
              {option.milheiroBrl !== null && option.miles > 0 && (
                <p className="mt-1 text-[11px] text-slate-400">
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
