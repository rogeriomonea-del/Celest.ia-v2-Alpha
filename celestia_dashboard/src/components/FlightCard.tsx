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
      <span className="tnum text-xs font-medium text-ink-500">
        {formatDuration(flight.durationMin)}
      </span>
      <div className="my-1.5 flex w-full items-center gap-2">
        <span className="tnum text-xs font-bold tracking-wide text-ink-700">
          {flight.departure.airportCode}
        </span>
        <div className="relative h-px flex-1 bg-ink-200">
          {flight.stops.map((stop, index) => (
            <span
              key={stop.airportCode}
              className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-gold-500 shadow-sm"
              style={{ left: `${((index + 1) / (stopCount + 1)) * 100}%`, marginLeft: '-4px' }}
              title={`Escala em ${stop.city}`}
            />
          ))}
          <Plane
            className="absolute -right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 text-ink-300"
            aria-hidden="true"
          />
        </div>
        <span className="tnum text-xs font-bold tracking-wide text-ink-700">
          {flight.arrival.airportCode}
        </span>
      </div>
      <span
        className={`text-xs font-semibold ${stopCount === 0 ? 'text-pine-600' : 'text-gold-700'}`}
      >
        {stopCount === 0
          ? 'Direto'
          : stopCount === 1
            ? `1 escala · ${flight.stops[0].airportCode}`
            : `${stopCount} escalas · ${flight.stops.map((stop) => stop.airportCode).join(', ')}`}
      </span>
    </div>
  )
}

function ExpandedDetails({ flight }: { flight: Flight }) {
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-ink-100 bg-ink-50/70 p-4 text-sm">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Itinerário
        </p>
        <ol className="space-y-2">
          <li className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-ink-900" aria-hidden="true" />
            <span className="text-ink-700">
              <strong className="font-semibold">{flight.departure.time}</strong> · Decola de{' '}
              {flight.departure.airportCode}
            </span>
          </li>
          {flight.stops.map((stop) => (
            <li key={stop.airportCode} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
              <span className="text-ink-700">
                Escala em <strong className="font-semibold">{stop.city}</strong> (
                {stop.airportCode}) · espera de {formatDuration(stop.layoverMin)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-pine-600" aria-hidden="true" />
            <span className="text-ink-700">
              <strong className="font-semibold">{flight.arrival.time}</strong>
              {flight.arrival.dayOffset > 0 && (
                <sup className="font-semibold text-ink-500"> +{flight.arrival.dayOffset}</sup>
              )}{' '}
              · Aterrissa em {flight.arrival.airportCode}
            </span>
          </li>
        </ol>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-200 pt-3 text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-ink-400" aria-hidden="true" />
          Item pessoal incluído
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Luggage className="h-4 w-4 text-ink-400" aria-hidden="true" />
          {flight.baggage.checkedBags === 0
            ? 'Bagagem despachada não incluída'
            : `${flight.baggage.checkedBags} ${
                flight.baggage.checkedBags > 1 ? 'bagagens' : 'bagagem'
              } de 23 kg`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Leaf className="h-4 w-4 text-ink-400" aria-hidden="true" />
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
    <article className="group animate-fade-up rounded-2xl border border-ink-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-lift sm:p-5">
      {hasBadges && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {isCheapest && (
            <Badge tone="gold" icon={Sparkles}>
              Melhor preço
            </Badge>
          )}
          {isFastest && (
            <Badge tone="amber" icon={Zap}>
              Mais rápido
            </Badge>
          )}
          {flight.stops.length === 0 && <Badge tone="pine">Voo direto</Badge>}
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
            <p className="tnum text-lg font-bold tracking-tight text-ink-900">
              {flight.departure.time}
              <span className="mx-1.5 font-normal text-ink-300">–</span>
              {flight.arrival.time}
              {flight.arrival.dayOffset > 0 && (
                <sup className="ml-0.5 text-xs font-semibold text-ink-500">
                  +{flight.arrival.dayOffset}
                </sup>
              )}
            </p>
            <p className="truncate text-xs text-ink-500">
              {flight.airline.name} · {flight.flightNumber}
            </p>
          </div>
        </div>

        {/* Center: duration + stops line */}
        <div className="px-0 md:px-2">
          <StopsLine flight={flight} />
        </div>

        {/* Right: price + CTA */}
        <div className="flex items-center justify-between gap-4 border-t border-ink-100 pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
          <div className="text-left md:text-right">
            <p className="tnum font-serif text-2xl font-semibold tracking-tight text-ink-900">
              {formatBRL(flight.price)}
            </p>
            <p className="text-xs text-ink-500">por pessoa</p>
            {flight.milesEquivalent != null && (
              <p className="tnum mt-0.5 text-[11px] font-semibold text-gold-700">
                ≈ {flight.milesEquivalent.toLocaleString('pt-BR')} milhas
              </p>
            )}
          </div>
          {flight.bookingUrl ? (
            <a
              href={flight.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white shadow-card ring-1 ring-inset ring-white/10 transition-colors hover:bg-ink-800"
            >
              Ver oferta
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Disponível quando a busca é feita pelo motor real"
              className="cursor-not-allowed rounded-full bg-ink-200 px-6 py-2.5 text-sm font-semibold text-ink-400"
            >
              Ver oferta
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          {flight.tags.includes('wifi') && (
            <span className="inline-flex items-center gap-1">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> Wi-Fi a bordo
            </span>
          )}
          {flight.tags.includes('eco') && (
            <span className="inline-flex items-center gap-1 text-pine-600">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" /> Sustentável
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
