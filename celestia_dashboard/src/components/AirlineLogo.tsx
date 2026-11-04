import { useState } from 'react'
import type { Airline } from '../types'

interface AirlineLogoProps {
  airline: Airline
  size?: 'sm' | 'md'
}

/** Carrier logo image; falls back to a gradient tile with the IATA code. */
export function AirlineLogo({ airline, size = 'md' }: AirlineLogoProps) {
  const [failed, setFailed] = useState(false)
  const sizeClasses = size === 'md' ? 'h-10 w-10 text-sm' : 'h-6 w-6 text-[10px]'
  if (airline.logoUrl && !failed) {
    return (
      <img
        src={airline.logoUrl}
        alt={airline.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-xl bg-white object-contain ${sizeClasses}`}
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-bold text-white shadow-sm ${airline.logoGradient} ${sizeClasses}`}
    >
      {airline.code}
    </div>
  )
}
