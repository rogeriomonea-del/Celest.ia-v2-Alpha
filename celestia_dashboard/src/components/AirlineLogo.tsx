import type { Airline } from '../types'

interface AirlineLogoProps {
  airline: Airline
  size?: 'sm' | 'md'
}

/** Placeholder logo: rounded tile with the airline's IATA code over a brand gradient. */
export function AirlineLogo({ airline, size = 'md' }: AirlineLogoProps) {
  const sizeClasses = size === 'md' ? 'h-10 w-10 text-sm' : 'h-6 w-6 text-[10px]'
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-bold text-white shadow-sm ${airline.logoGradient} ${sizeClasses}`}
    >
      {airline.code}
    </div>
  )
}
