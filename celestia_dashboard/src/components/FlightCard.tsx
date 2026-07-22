import { useId, useState } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  ChevronDown,
  Clock3,
  Gauge,
  Info,
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
import type { CabinClass, Flight } from '../types'

interface FlightCardProps {
  flight: Flight
  isCheapest: boolean
  isFastest: boolean
}

const CABIN_LABEL: Record<CabinClass, string> = {
  economy: 'Econômica',
  premium: 'Premium Economy',
  business: 'Executiva',
}

function StopsLine({ flight }: { flight: Flight }) {
  const stopCount = flight.stops.length
  return (
    <div className="flex w-full flex-col items-center">
      <span className="tnum text-xs font-semibold text-space-100/60">{formatDuration(flight.durationMin)}</span>
      <div className="my-2 flex w-full items-center gap-2">
        <span className="tnum text-xs font-bold tracking-[0.12em] text-space-100">{flight.departure.airportCode}</span>
        <div className="flight-route-line relative h-px flex-1">
          {flight.stops.map((stop, index) => (
            <span
              key={`${stop.airportCode}-${index}`}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-space-900 bg-gold-300 shadow-[0_0_10px_rgba(228,205,155,.48)]"
              style={{ left: `${((index + 1) / (stopCount + 1)) * 100}%`, marginLeft: '-5px' }}
              title={`Escala em ${stop.city}`}
            />
          ))}
          <Plane className="absolute -right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 text-aqua-200 drop-shadow-[0_0_5px_rgba(85,230,230,.72)]" aria-hidden="true" />
        </div>
        <span className="tnum text-xs font-bold tracking-[0.12em] text-space-100">{flight.arrival.airportCode}</span>
      </div>
      <span className={`text-xs font-bold ${stopCount === 0 ? 'text-pine-300' : 'text-gold-300'}`}>
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
    <div className="flight-details mt-4 grid gap-5 rounded-2xl p-4 text-sm lg:grid-cols-[1.2fr_.8fr]">
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-space-200/50">Itinerário</p>
        <ol className="space-y-2.5">
          <li className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-aqua-200 shadow-[0_0_8px_rgba(85,230,230,.7)]" aria-hidden="true" />
            <span className="text-space-100/70"><strong className="tnum font-bold text-space-100">{flight.departure.time}</strong> · saída de {flight.departure.airportCode}</span>
          </li>
          {flight.stops.map((stop, index) => (
            <li key={`${stop.airportCode}-${index}`} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-gold-300 shadow-[0_0_8px_rgba(228,205,155,.45)]" aria-hidden="true" />
              <span className="text-space-100/70">Escala em <strong className="font-bold text-space-100">{stop.city}</strong> ({stop.airportCode}) · {formatDuration(stop.layoverMin)}</span>
            </li>
          ))}
          <li className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-gold-300 shadow-[0_0_8px_rgba(228,205,155,.45)]" aria-hidden="true" />
            <span className="text-space-100/70">
              <strong className="tnum font-bold text-space-100">{flight.arrival.time}</strong>
              {flight.arrival.dayOffset > 0 && <sup className="font-bold text-space-100/65"> +{flight.arrival.dayOffset}</sup>} · chegada a {flight.arrival.airportCode}
            </span>
          </li>
        </ol>
      </div>

      <div className="border-t border-space-100/10 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-space-200/50">Informações da oferta</p>
        <dl className="space-y-2 text-xs text-space-100/55">
          <div className="flex justify-between gap-3"><dt>Fonte</dt><dd className="font-semibold text-space-100">{flight.sourceLabel}</dd></div>
          <div className="flex justify-between gap-3"><dt>Cabine</dt><dd className="font-semibold text-space-100">{CABIN_LABEL[flight.cabin]}</dd></div>
          {flight.fareBrand && <div className="flex justify-between gap-3"><dt>Tarifa</dt><dd className="font-semibold text-space-100">{flight.fareBrand}</dd></div>}
          {flight.aircraft && <div className="flex justify-between gap-3"><dt>Aeronave</dt><dd className="font-semibold text-space-100">{flight.aircraft}</dd></div>}
          {flight.taxesBrl > 0 && <div className="flex justify-between gap-3"><dt>Taxas informadas</dt><dd className="tnum font-semibold text-space-100">{formatBRL(flight.taxesBrl)}</dd></div>}
          {flight.priceMiles !== null && (
            <div className="flex justify-between gap-3"><dt>Emissão</dt><dd className="tnum text-right font-semibold text-gold-200">{flight.priceMiles.toLocaleString('pt-BR')} milhas{flight.milesProgram ? ` · ${flight.milesProgram}` : ''}</dd></div>
          )}
        </dl>
      </div>

      {(flight.baggage || flight.emissions) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-space-100/10 pt-3 text-xs text-space-100/60 lg:col-span-2">
          {flight.baggage && (
            <>
              <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-aqua-200/70" aria-hidden="true" /> Item pessoal incluído</span>
              <span className="inline-flex items-center gap-1.5"><Luggage className="h-4 w-4 text-aqua-200/70" aria-hidden="true" />{flight.baggage.checkedBags === 0 ? 'Bagagem despachada não incluída' : `${flight.baggage.checkedBags} ${flight.baggage.checkedBags > 1 ? 'bagagens' : 'bagagem'} de 23 kg`}</span>
            </>
          )}
          {flight.emissions && (
            <span className="inline-flex items-center gap-1.5"><Leaf className="h-4 w-4 text-pine-300" aria-hidden="true" />Emissões {flight.emissions === 'low' ? 'abaixo da' : flight.emissions === 'high' ? 'acima da' : 'na'} média</span>
          )}
        </div>
      )}
    </div>
  )
}

export function FlightCard({ flight, isCheapest, isFastest }: FlightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()

  return (
    <article className={`flight-card group animate-fade-up p-4 sm:p-5 ${isCheapest ? 'flight-card--gold' : ''} ${isFastest ? 'flight-card--aqua' : ''}`}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {flight.indicative && <Badge tone="amber" icon={Info}>Tarifa indicativa</Badge>}
        {flight.scheduleEstimated && <Badge tone="ink" icon={Clock3}>Horários estimados</Badge>}
        {isCheapest && <Badge tone="gold" icon={Sparkles}>Melhor preço</Badge>}
        {isFastest && <Badge tone="pine" icon={Zap}>Mais rápido</Badge>}
        {flight.stops.length === 0 && <Badge tone="pine">Voo direto</Badge>}
        {flight.seatsLeft !== null && <Badge tone="red" icon={AlertCircle}>Restam {flight.seatsLeft} lugares</Badge>}
      </div>

      <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.05fr)_auto] md:gap-7">
        <div className="flex min-w-0 items-center gap-3">
          <AirlineLogo airline={flight.airline} />
          <div className="min-w-0">
            <h3 className="tnum text-xl font-semibold tracking-tight text-[#f5ecdd]">
              {flight.departure.time}<span className="mx-1.5 font-normal text-space-200/30">–</span>{flight.arrival.time}
              {flight.arrival.dayOffset > 0 && <sup className="ml-0.5 text-xs font-bold text-space-100/65">+{flight.arrival.dayOffset}</sup>}
            </h3>
            <p className="truncate text-xs font-medium text-space-100/60">{flight.airline.name} · {flight.flightNumber}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-aqua-200/80">{CABIN_LABEL[flight.cabin]}</p>
          </div>
        </div>

        <div className="px-0 md:px-2"><StopsLine flight={flight} /></div>

        <div className="flight-price-console flex flex-col gap-3 border-t border-space-100/10 p-4 md:min-w-[13.5rem] md:items-end md:border md:pt-4">
          <div className="text-left md:text-right">
            <p className="tnum font-serif text-3xl font-medium tracking-tight text-[#f5ecdd]">{formatBRL(flight.price)}</p>
            <p className="text-xs text-space-100/50">por passageiro</p>
            <p className="tnum mt-1 text-xs font-bold text-gold-200">
              {flight.milesEquivalent !== null
                ? `≈ ${flight.milesEquivalent.toLocaleString('pt-BR')} milhas equivalentes`
                : 'Equivalência em milhas indisponível'}
            </p>
          </div>
          {flight.bookingUrl ? (
            <a
              href={flight.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver oferta de ${flight.airline.name}; abre em nova aba`}
              className="primary-button w-full md:w-auto"
            >
              Ver oferta <ArrowUpRight className="h-4 w-4 text-aqua-200" aria-hidden="true" />
            </a>
          ) : (
            <button type="button" disabled title="Disponível em buscas do motor" className="primary-button w-full md:w-auto">Ver oferta</button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-space-100/10 pt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-space-100/55">
          <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5 text-aqua-200/80" aria-hidden="true" /> Fonte: {flight.sourceLabel}</span>
          {flight.tags.includes('wifi') && <span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" aria-hidden="true" /> Wi-Fi</span>}
          {flight.tags.includes('best-rated') && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" aria-hidden="true" /> Bem avaliado</span>}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-bold text-aqua-200 transition-colors hover:bg-aqua-300/[0.07] hover:text-aqua-100"
        >
          {expanded ? 'Ocultar detalhes' : 'Detalhes do voo'}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {expanded && <div id={detailsId}><ExpandedDetails flight={flight} /></div>}
    </article>
  )
}
