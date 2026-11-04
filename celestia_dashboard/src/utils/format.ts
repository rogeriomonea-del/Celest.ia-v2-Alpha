const moneyFormatters = new Map<string, Intl.NumberFormat>()

/** pt-BR currency format; BRL without cents, other currencies with their default digits. */
export function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase()
  let formatter = moneyFormatters.get(code)
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: code,
      ...(code === 'BRL' ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    })
    moneyFormatters.set(code, formatter)
  }
  return formatter.format(amount)
}

export function formatDuration(totalMin: number): string {
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

/** Compact date for the search fields: "Sáb., 15 ago." */
export function formatShortDate(date: Date | null): string {
  if (!date) return ''
  const weekday = weekdayFormatter.format(date)
  const month = monthFormatter.format(date).replace('.', '')
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalizedWeekday}, ${date.getDate()} ${month}.`
}

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' })

/** Full date for accessible names: "sábado, 15 de agosto de 2026". */
export function formatFullDate(date: Date): string {
  return fullDateFormatter.format(date)
}

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
})

export function formatMonthYear(date: Date): string {
  const formatted = monthYearFormatter.format(date)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/** Case- and accent-insensitive normalization for typeahead matching. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
