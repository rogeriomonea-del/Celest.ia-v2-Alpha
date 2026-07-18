import { useState } from 'react'
import {
  AlertCircle,
  Briefcase,
  ChevronDown,
  Leaf,
  Luggage,
  Plane,
  Sparkles,
  Star,
  Wifi,
  Zap,
} from 'lucide-react'
import { AirlineLogo } from './AirlineLogo'
import { Badge } from './Badge'
import { formatBRL, formatDuration } from '../utils/format'
import type { Flight } from '../types'

interface FlightCardProps {
  flight: Flight
  isCheapest: boolean
  isFastest: boolean
}

function StopsLine({ flight }: { flight: Flight }) {
  const stopCount = flight.stops.length
  return (
    <div className="flex w-full flex-col items-center">
      <span className="text-xs font-medium text-slate-500">
        {formatDuration(flight.durationMin)}
      </span>
      <div className="my-1.5 flex w-full items-center gap-2">
        <span className="text-xs font-bold tracking-wide text-slate-700">
          {flight.departure.airportCode}
        </span>
        <div className="relative h-px flex-1 bg-slate-300">
          {flight.stops.map((stop, index) => (
            <span
              key={stop.airportCode}
              className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow-sm"
              style={{ left: `${((index + 1) / (stopCount + 1)) * 100}%`, marginLeft: '-4px' }}
              title={`Escala em ${stop.city}`}
            />
          ))}
          <Plane
            className="absolute -right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 text-slate-400"
            aria-hidden="true"
          />
        </div>
        <span className="text-xs font-bold tracking-wide text-slate-700">
          {flight.arrival.airportCode}
        </span>
      </div>
      <span
        className={`text-xs font-semibold ${stopCount === 0 ? 'text-green-600' : 'text-amber-600'}`}
      >
        {stopCount === 0
          ? 'Direto'
          : stopCount === 1
            ? `1 parada · ${flight.stops[0].airportCode}`
            : `${stopCount} paradas · ${flight.stops.map((stop) => stop.airportCode).join(', ')}`}
      </span>
    </div>
  )
}

function ExpandedDetails({ flight }: { flight: Flight }) {
  return (
    <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4 text-sm">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Itinerário
        </p>
        <ol className="space-y-2">
          <li className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-hidden="true" />
            <span className="text-slate-700">
              <strong className="font-semibold">{flight.departure.time}</strong> · Decola de{' '}
              {flight.departure.airportCode}
            </span>
          </li>
          {flight.stops.map((stop) => (
            <li key={stop.airportCode} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span className="text-slate-700">
                Conexão em <strong className="font-semibold">{stop.city}</strong> (
                {stop.airportCode}) · espera de {formatDuration(stop.layoverMin)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
            <span className="text-slate-700">
              <strong className="font-semibold">{flight.arrival.time}</strong>
              {flight.arrival.dayOffset > 0 && (
                <sup className="font-semibold text-slate-500"> +{flight.arrival.dayOffset}</sup>
              )}{' '}
              · Aterrissa em {flight.arrival.airportCode}
            </span>
          </li>
        </ol>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Item pessoal incluído
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Luggage className="h-4 w-4 text-slate-400" aria-hidden="true" />
          {flight.baggage.checkedBags === 0
            ? 'Bagagem despachada não incluída'
            : `${flight.baggage.checkedBags} bagagem${flight.baggage.checkedBags > 1 ? 'ns' : ''} de 23 kg`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Leaf className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Emissões {flight.emissions === 'low' ? 'abaixo da' : flight.emissions === 'high' ? 'acima da' : 'na'}{' '}
          média
        </span>
      </div>
    </div>
  )
}

export function FlightCard({ flight, isCheapest, isFastest }: FlightCardProps) {
  const [expanded, setExpanded] = useState(false)

  const hasBadges =
    isCheapest || isFastest || flight.stops.length === 0 || flight.seatsLeft !== null

  return (
    <article className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      {hasBadges && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {isCheapest && (
            <Badge tone="indigo" icon={Sparkles}>
              Melhor preço
            </Badge>
          )}
          {isFastest && (
            <Badge tone="amber" icon={Zap}>
              Mais rápido
            </Badge>
          )}
          {flight.stops.length === 0 && <Badge tone="green">Voo direto</Badge>}
          {flight.seatsLeft !== null && (
            <Badge tone="red" icon={AlertCircle}>
              Poucos lugares · restam {flight.seatsLeft}
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto] md:gap-6">
        {/* Left: airline + times */}
        <div className="flex items-center gap-3">
          <AirlineLogo airline={flight.airline} />
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight text-slate-900">
              {flight.departure.time}
              <span className="mx-1.5 font-normal text-slate-300">–</span>
              {flight.arrival.time}
              {flight.arrival.dayOffset > 0 && (
                <sup className="ml-0.5 text-xs font-semibold text-slate-500">
                  +{flight.arrival.dayOffset}
                </sup>
              )}
            </p>
            <p className="truncate text-xs text-slate-500">
              {flight.airline.name} · {flight.flightNumber}
            </p>
          </div>
        </div>

        {/* Center: duration + stops line */}
        <div className="px-0 md:px-2">
          <StopsLine flight={flight} />
        </div>

        {/* Right: price + CTA */}
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
          <div className="text-left md:text-right">
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">
              {formatBRL(flight.price)}
            </p>
            <p className="text-xs text-slate-500">por pessoa</p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Ver oferta
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {flight.tags.includes('wifi') && (
            <span className="inline-flex items-center gap-1">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> Wi-Fi a bordo
            </span>
          )}
          {flight.tags.includes('eco') && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" /> Eco friendly
            </span>
          )}
          {flight.tags.includes('best-rated') && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5" aria-hidden="true" /> Bem avaliado
            </span>
          )}
          {flight.tags.includes('flexible') && (
            <span className="inline-flex items-center gap-1">Remarcação flexível</span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
        >
          Detalhes do voo
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded && <ExpandedDetails flight={flight} />}
    </article>
  )
}
