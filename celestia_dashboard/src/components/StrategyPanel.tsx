import { Award, Check, Coins, CreditCard, Sparkles, TrendingUp } from 'lucide-react'
import { formatBRL } from '../utils/format'
import type { CabinClass, PurchaseStrategy } from '../types'

interface StrategyPanelProps {
  options: PurchaseStrategy[]
}

const CABIN_LABEL: Record<CabinClass, string> = {
  economy: 'Econômica',
  premium: 'Premium Economy',
  business: 'Executiva',
}

const STRATEGY_ICON: Record<string, typeof CreditCard> = {
  business_cash: CreditCard,
  full_miles: Award,
  economy_miles_upgrade: TrendingUp,
  economy_cash_upgrade: Coins,
}

function Composition({ option, inverse = false }: { option: PurchaseStrategy; inverse?: boolean }) {
  return (
    <p className={`tnum text-sm ${inverse ? 'text-space-100/80' : 'text-space-100/60'}`}>
      {option.miles > 0
        ? `${option.miles.toLocaleString('pt-BR')} milhas + ${formatBRL(Math.round(option.cashBrl))}`
        : `${formatBRL(Math.round(option.cashBrl))} em dinheiro`}
      <span className="text-space-200/30"> · </span>
      {CABIN_LABEL[option.cabinFinal]}
    </p>
  )
}

export function StrategyPanel({ options }: StrategyPanelProps) {
  if (options.length === 0) return null
  const [best, ...alternatives] = options
  const BestIcon = STRATEGY_ICON[best.strategy] ?? Sparkles

  return (
    <section aria-labelledby="strategy-title">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="system-kicker">Cálculo de decisão · inteligência comparativa</p>
          <h3 id="strategy-title" className="mt-2 font-serif text-2xl font-light text-[#f5ecdd] sm:text-3xl">
            A forma mais inteligente de comprar
          </h3>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-space-100/55 sm:text-right">
          O custo efetivo coloca dinheiro, milhas e upgrade na mesma régua financeira.
        </p>
      </div>

      <article className="strategy-primary relative overflow-hidden rounded-[1.5rem] p-5 text-white shadow-nebula sm:p-7">
        <div aria-hidden="true" className="absolute inset-0 starfield opacity-35" />
        <div aria-hidden="true" className="absolute -right-16 -top-28 h-72 w-72 rounded-full border border-aqua-200/12" />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
          <div>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold-200/30 bg-gold-200/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Melhor opção
            </span>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-aqua-200/25 bg-aqua-300/10">
                <BestIcon className="h-5 w-5 text-aqua-200" aria-hidden="true" />
              </span>
              <div>
                <h4 className="font-serif text-2xl font-medium text-[#fff8e9]">{best.label}</h4>
                <Composition option={best} inverse />
              </div>
            </div>
            {best.notes.length > 0 && (
              <ul className="mt-5 grid gap-2 text-xs leading-relaxed text-space-100 sm:grid-cols-2">
                {best.notes.map((note, index) => (
                  <li key={`${best.id}-note-${index}`} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-aqua-200" aria-hidden="true" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-aqua-200/12 bg-space-950/55 p-5 backdrop-blur-sm lg:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-space-200">Custo efetivo total</p>
            <p className="tnum mt-1 font-serif text-4xl font-medium text-[#fff8e9] sm:text-5xl">
              {formatBRL(Math.round(best.effectiveTotalBrl))}
            </p>
            <div className="mt-3 space-y-1 text-xs text-space-100">
              {best.milheiroBrl !== null && best.miles > 0 && (
                <p>Milheiro considerado: <strong className="text-white">{formatBRL(best.milheiroBrl)}</strong></p>
              )}
              {best.breakevenMilheiroBrl !== null && (
                <p>Empate financeiro em <strong className="text-gold-200">{formatBRL(best.breakevenMilheiroBrl)}/milheiro</strong></p>
              )}
            </div>
          </div>
        </div>
      </article>

      {alternatives.length > 0 && (
        <div className="strategy-alternatives thin-scrollbar mt-3 flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
          {alternatives.map((option) => {
            const Icon = STRATEGY_ICON[option.strategy] ?? CreditCard
            return (
              <article key={option.id} className="strategy-alternative min-w-[17rem] snap-start rounded-2xl p-4 lg:min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-aqua-200/15 bg-aqua-300/[0.05] text-aqua-200">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="tnum font-serif text-xl font-medium text-[#f5ecdd]">
                    {formatBRL(Math.round(option.effectiveTotalBrl))}
                  </p>
                </div>
                <h4 className="mt-3 text-sm font-bold text-space-100">{option.label}</h4>
                <Composition option={option} />
                {option.breakevenMilheiroBrl !== null && (
                  <p className="tnum mt-2 text-[11px] text-gold-200/85">
                    Ponto de equilíbrio: {formatBRL(option.breakevenMilheiroBrl)}/milheiro
                  </p>
                )}
                {option.notes.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-space-100/10 pt-3 text-[11px] leading-relaxed text-space-100/55">
                    {option.notes.map((note, index) => (
                      <li key={`${option.id}-note-${index}`} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold-300" aria-hidden="true" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
