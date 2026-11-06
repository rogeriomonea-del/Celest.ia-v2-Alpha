import { formatMilheiro, formatMiles, formatMoney } from '../utils/format'
import type { FlightMiles, PurchaseOption } from '../types'

/**
 * true when the award is for this exact itinerary and its option costs less, in effective BRL,
 * than paying cash. An award that may be on other flights is no claim about this offer.
 */
export function awardBeatsCash(miles: FlightMiles): boolean {
  if (miles.award?.matchesItinerary !== true) return false
  const cash = miles.options.find((option) => option.strategy === 'cash')
  const award = miles.options.find((option) => option.strategy === 'award')
  if (!cash || !award || cash.effectiveTotalBrl === null || award.effectiveTotalBrl === null) return false
  return award.effectiveTotalBrl < cash.effectiveTotalBrl
}

function seatsLabel(seats: number): string {
  return seats === 1 ? '1 assento' : `${seats} assentos`
}

interface MilesProps {
  miles: FlightMiles
  /** Milheiro the search valued the miles at (the response's miles summary); null when none was set. */
  milheiro: number | null
}

/** Why the fare has no miles equivalent: no milheiro, or a fare the server does not convert to BRL. */
function noEquivalentText(miles: FlightMiles, milheiro: number | null): string {
  if (milheiro === null) return 'Em milhas: informe o milheiro'
  const currency = miles.options.find((option) => option.strategy === 'cash')?.cash.currency ?? 'outra moeda'
  return `Em milhas: tarifa em ${currency}, sem conversão`
}

/** Short lines under the price: the fare in miles and the award found. */
export function MilesPriceLines({ miles, milheiro }: MilesProps) {
  const { award } = miles
  return (
    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
      {miles.equivalentMiles !== null ? (
        <p title={milheiro !== null ? `ao milheiro de ${formatMilheiro(milheiro)}` : undefined}>
          ≈ {formatMiles(miles.equivalentMiles)} milhas
        </p>
      ) : (
        <p>{noEquivalentText(miles, milheiro)}</p>
      )}
      {award && (
        <p className="font-medium text-slate-700">
          Award {award.programName}: {formatMiles(award.miles)} mi
          {award.taxes && ` + ${formatMoney(award.taxes.amount, award.taxes.currency)}`}
          {award.seatsLeft !== null && ` · ${seatsLabel(award.seatsLeft)}`}
          {!award.matchesItinerary && <span className="ml-1 font-normal text-slate-400">· voos podem diferir</span>}
        </p>
      )}
    </div>
  )
}

function optionPrice(option: PurchaseOption): string {
  const cash = formatMoney(option.cash.amount, option.cash.currency)
  return option.miles > 0 ? `${formatMiles(option.miles)} mi + ${cash}` : cash
}

/** "Como pagar": every way to pay for the offer with its effective cost. */
export function PurchaseOptionsList({ miles }: { miles: FlightMiles }) {
  if (miles.options.length === 0) return null
  return (
    <div className="text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Como pagar</p>
      <ul aria-label="Como pagar" className="space-y-2">
        {miles.options.map((option, index) => (
          <li key={`${option.strategy}-${option.program ?? ''}-${index}`} className="text-slate-700">
            <span className="font-semibold">{option.label}</span>: {optionPrice(option)} · custo efetivo{' '}
            {option.effectiveTotalBrl !== null ? formatMoney(option.effectiveTotalBrl, 'BRL') : '—'}
            {option.notes.length > 0 && (
              <ul className="ml-4 mt-0.5 list-disc text-xs text-slate-500">
                {option.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Both blocks together, for the offer dialog. `label`, when set, heads the block (e.g. stale values). */
export function MilesBlock({ miles, milheiro, label }: MilesProps & { label?: string }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      {label && <p className="text-xs font-semibold text-amber-700">{label}</p>}
      <MilesPriceLines miles={miles} milheiro={milheiro} />
      <PurchaseOptionsList miles={miles} />
    </div>
  )
}
