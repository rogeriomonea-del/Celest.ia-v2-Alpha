/** Miles valuation of a cash offer vs an award fare. Pure functions, no I/O. */
import type { AwardFare, CabinClass, Flight, FlightMiles, Money, PurchaseOption } from '../../src/types.js'

/** The search's miles settings, resolved against the program registry. */
export interface MilesSettings {
  program: string
  programName: string
  /** BRL per 1,000 miles; null = unknown, so nothing is valued. */
  milheiroBrl: number | null
  balance: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

const brl = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const milesText = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

/** Amount in BRL, or null when it is in another currency (a zero amount counts as BRL). */
const brlAmount = (money: Money) => (money.currency === 'BRL' || money.amount === 0 ? money.amount : null)

function cashOption(offer: Flight, cabin: CabinClass): PurchaseOption {
  return {
    strategy: 'cash',
    label: 'Passagem em dinheiro',
    cabin,
    cash: { amount: round2(offer.price), currency: offer.currency },
    miles: 0,
    program: null,
    milheiroBrl: null,
    effectiveTotalBrl: offer.currency === 'BRL' ? round2(offer.price) : null,
    breakevenMilheiroBrl: null,
    notes: [],
  }
}

function awardOption(award: AwardFare, settings: MilesSettings, cash: PurchaseOption): PurchaseOption {
  const notes: string[] = []
  const taxes = award.taxes ? { amount: round2(award.taxes.amount), currency: award.taxes.currency } : { amount: 0, currency: 'BRL' }
  if (!award.taxes) notes.push('Taxas não informadas pelo provedor')

  const taxesBrl = brlAmount(taxes)
  const milheiro = award.program === settings.program ? settings.milheiroBrl : null
  const effectiveTotalBrl =
    taxesBrl !== null && milheiro !== null ? round2(taxesBrl + (award.miles / 1000) * milheiro) : null
  // Compared against this same offer's cash fare, so the cabin always matches.
  const breakeven =
    cash.effectiveTotalBrl !== null && taxesBrl !== null && award.miles > 0
      ? round2(Math.max(0, ((cash.effectiveTotalBrl - taxesBrl) / award.miles) * 1000))
      : null

  if (milheiro !== null && breakeven !== null && milheiro <= breakeven) {
    notes.push(`Vale a pena com milheiro <= ${brl(breakeven)}`)
  }
  if (award.program === settings.program && settings.balance < award.miles) {
    notes.push(`Saldo insuficiente: faltam ${milesText(award.miles - settings.balance)} milhas`)
  }
  if (!award.matchesItinerary) notes.push('Voos podem diferir da oferta')
  if (effectiveTotalBrl !== null && milheiro !== null) {
    notes.push(`Equivalente em dinheiro: ${brl(effectiveTotalBrl)} (milheiro ${brl(milheiro)})`)
  }

  return {
    strategy: 'award',
    label: `Emissão em milhas (${award.programName})`,
    cabin: award.cabin,
    cash: taxes,
    miles: award.miles,
    program: award.program,
    milheiroBrl: milheiro,
    effectiveTotalBrl,
    breakevenMilheiroBrl: breakeven,
    notes,
  }
}

/** Cheapest effective BRL total first; options that cannot be valued go last. */
function byEffectiveTotal(a: PurchaseOption, b: PurchaseOption): number {
  if (a.effectiveTotalBrl === null) return b.effectiveTotalBrl === null ? 0 : 1
  if (b.effectiveTotalBrl === null) return -1
  return a.effectiveTotalBrl - b.effectiveTotalBrl
}

/** Values one offer (per passenger) in miles and ranks paying cash vs the award, if any. `cabin` is the searched cabin. */
export function valueOffer(offer: Flight, settings: MilesSettings, award: AwardFare | null, cabin: CabinClass): FlightMiles {
  const equivalentMiles =
    offer.currency === 'BRL' && settings.milheiroBrl !== null
      ? Math.round((offer.price / settings.milheiroBrl) * 1000)
      : null
  const cash = cashOption(offer, cabin)
  const options = award ? [cash, awardOption(award, settings, cash)] : [cash]
  return { equivalentMiles, award, options: options.sort(byEffectiveTotal) }
}
