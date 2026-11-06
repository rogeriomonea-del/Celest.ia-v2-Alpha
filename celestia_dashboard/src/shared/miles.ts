/**
 * Loyalty programs known to the miles module. Shared by the API and the app.
 *
 * `defaultMilheiroBrl` is the owner's reference price of 1,000 miles in BRL
 * (what you pay to buy/transfer them in promotions); null = the user must
 * type one before valuations are shown. `awardSource` is the code the award
 * provider (seats.aero) uses for the program, null = no award lookup.
 */
export interface MilesProgramInfo {
  code: string
  name: string
  defaultMilheiroBrl: number | null
  awardSource: string | null
}

export const MILES_PROGRAMS: readonly MilesProgramInfo[] = [
  { code: 'latampass', name: 'LATAM Pass', defaultMilheiroBrl: 29, awardSource: null },
  { code: 'smiles', name: 'Smiles (GOL)', defaultMilheiroBrl: 22, awardSource: 'smiles' },
  { code: 'azul', name: 'Azul Fidelidade', defaultMilheiroBrl: 24, awardSource: 'azul' },
  { code: 'connectmiles', name: 'ConnectMiles (Copa)', defaultMilheiroBrl: 34, awardSource: 'connectmiles' },
  { code: 'lifemiles', name: 'LifeMiles (Avianca)', defaultMilheiroBrl: null, awardSource: 'lifemiles' },
  { code: 'aeroplan', name: 'Aeroplan (Air Canada)', defaultMilheiroBrl: null, awardSource: 'aeroplan' },
  { code: 'aadvantage', name: 'AAdvantage (American)', defaultMilheiroBrl: null, awardSource: 'american' },
  { code: 'mileageplus', name: 'MileagePlus (United)', defaultMilheiroBrl: null, awardSource: 'united' },
  { code: 'flyingblue', name: 'Flying Blue (Air France-KLM)', defaultMilheiroBrl: null, awardSource: 'flyingblue' },
] as const

export function findMilesProgram(code: string): MilesProgramInfo | null {
  return MILES_PROGRAMS.find((program) => program.code === code) ?? null
}
