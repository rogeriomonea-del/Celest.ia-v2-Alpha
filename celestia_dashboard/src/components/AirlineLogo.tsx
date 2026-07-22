import type { Airline } from '../types'

interface AirlineLogoProps {
  airline: Airline
  size?: 'sm' | 'md'
}

/** Monochrome IATA marker: keeps the interface calm and avoids external logo requests. */
export function AirlineLogo({ airline, size = 'md' }: AirlineLogoProps) {
  const sizeClasses = size === 'md' ? 'h-10 w-10 text-sm' : 'h-6 w-6 text-[10px]'
  return (
    <div
      aria-hidden="true"
      className={`airline-marker flex shrink-0 items-center justify-center rounded-xl font-bold tracking-[0.08em] text-space-100 ${sizeClasses}`}
    >
      {airline.code}
    </div>
  )
}
