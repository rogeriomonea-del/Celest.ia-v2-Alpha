export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Local calendar date as "YYYY-MM-DD" (no UTC conversion). */
export function toISODate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parses "YYYY-MM-DD" as local midnight. Throws RangeError on invalid input. */
export function fromISODate(value: string): Date {
  const match = ISO_DATE.exec(value)
  if (!match) throw new RangeError(`Data inválida: ${value}`)
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    throw new RangeError(`Data inválida: ${value}`)
  }
  return date
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isBetween(date: Date, start: Date, end: Date): boolean {
  const t = startOfDay(date).getTime()
  return t > startOfDay(start).getTime() && t < startOfDay(end).getTime()
}

/**
 * Builds the calendar grid for a month: an array of weeks, where each cell is
 * a Date or null (padding before the 1st / after the last day). Weeks start
 * on Sunday, matching the pt-BR convention.
 */
export function getMonthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: (Date | null)[][] = []
  let week: (Date | null)[] = new Array(firstDay.getDay()).fill(null)

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(new Date(year, month, day))
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}
