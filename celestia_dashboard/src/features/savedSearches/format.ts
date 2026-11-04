import type { CabinClass, PassengerCounts, SearchParams } from '../../types'

const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })

/** "12 dez" */
function formatDayMonth(date: Date): string {
  const parts = dayMonthFormatter.formatToParts(date)
  const day = parts.find((part) => part.type === 'day')?.value ?? String(date.getDate())
  const month = (parts.find((part) => part.type === 'month')?.value ?? '').replace('.', '')
  return `${day} ${month}`
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function formatPassengers({ adults, children, infants }: PassengerCounts): string {
  const parts = [plural(adults, 'adulto', 'adultos')]
  if (children > 0) parts.push(plural(children, 'criança', 'crianças'))
  if (infants > 0) parts.push(plural(infants, 'bebê', 'bebês'))
  return parts.join(', ')
}

const CABIN_LABELS: Record<Exclude<CabinClass, 'economy'>, string> = {
  premium: 'Premium',
  business: 'Executiva',
}

/** "GRU → LIS · 12 dez – 19 dez · 1 adulto" (cabin appended when not economy). */
export function describeSavedSearch(params: SearchParams): string {
  const route = `${params.origin.code} → ${params.destination.code}`
  const depart = params.departDate ? formatDayMonth(params.departDate) : ''
  const dates =
    params.tripType === 'roundtrip' && params.returnDate
      ? `${depart} – ${formatDayMonth(params.returnDate)}`
      : depart
  const parts = [route, dates, formatPassengers(params.passengers)]
  if (params.cabin !== 'economy') parts.push(CABIN_LABELS[params.cabin])
  return parts.filter(Boolean).join(' · ')
}
