import { formatMilheiro, formatMiles, formatMoney } from '../utils/format'
import type { FlightMiles, PurchaseOption } from '../types'

/** Milheiro the server valued the miles at (shared by every option). */
function valuationMilheiro(miles: FlightMiles): number | null {
  return miles.options.find((option) => option.milheiroBrl !== null)?.milheiroBrl ?? null
}

/** true when the best award option costs less, in effective BRL, than the best cash option. */
export function awardBeatsCash(miles: FlightMiles): boolean {
  const cash = miles.options.find((option) => option.strategy === 'cash')
  const award = miles.options.find((option) => option.strategy === 'award')
  if (!cash || !award || cash.effectiveTotalBrl === null || award.effectiveTotalBrl === null) return false
  return award.effectiveTotalBrl < cash.effectiveTotalBrl
}

function seatsLabel(seats: number): string {
  return seats === 1 ? '1 assento' : `${seats} assentos`
}

/** Short lines under the price: the fare in miles and the award found. */
export function MilesPriceLines({ miles }: { miles: FlightMiles }) {
  const milheiro = valuationMilheiro(miles)
  const { award } = miles
  return (
    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
      {miles.equivalentMiles !== null ? (
        <p title={milheiro !== null ? `ao milheiro de ${formatMilheiro(milheiro)}` : undefined}>
          ≈ {formatMiles(miles.equivalentMiles)} milhas
        </p>
      ) : (
        milheiro === null && <p>Em milhas: informe o milheiro</p>
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

/** Both blocks together, for the offer dialog. */
export function MilesBlock({ miles }: { miles: FlightMiles }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <MilesPriceLines miles={miles} />
      <PurchaseOptionsList miles={miles} />
    </div>
  )
}
