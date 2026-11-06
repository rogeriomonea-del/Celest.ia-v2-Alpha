import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { ApiError, fetchOffer, UNREACHABLE_MESSAGE } from '../lib/api'
import { formatMoney } from '../utils/format'
import { OfferDetails } from './FlightCard'
import { MilesBlock } from './MilesInfo'
import type { Flight } from '../types'

interface OfferDialogProps {
  /** Offer as shown on the card; re-fetched on open for the current price. */
  flight: Flight
  passengerCount: number
  /** Milheiro the search valued the card's miles at; null when none was set. */
  milheiro: number | null
  onClose: () => void
  /** Re-runs the current search (used when the offer expired). */
  onResearch: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; offer: Flight }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Modal with the refreshed offer. Mirrors LoginDialog's focus/Escape handling. */
export function OfferDialog({ flight, passengerCount, milheiro, onClose, onResearch }: OfferDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchOffer(flight.id, controller.signal).then(
      (offer) => setState({ kind: 'ready', offer }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && (err.code === 'offer_expired' || err.code === 'not_found')) {
          setState({ kind: 'expired' })
        } else {
          setState({ kind: 'error', message: err instanceof ApiError ? err.message : UNREACHABLE_MESSAGE })
        }
      },
    )
    return () => controller.abort()
  }, [flight.id])

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const money = (value: number, currency: string) => formatMoney(value, currency)
  // Compare what the user sees: BRL is shown without cents.
  const priceChanged =
    state.kind === 'ready' &&
    money(state.offer.totalPrice, state.offer.currency) !== money(flight.totalPrice, flight.currency)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <h2 id={titleId} className="pr-8 text-xl font-bold tracking-tight text-slate-900">
          {flight.airline.name} · {flight.departure.airportCode} → {flight.arrival.airportCode}
        </h2>

        <div role="status" aria-live="polite" className="mt-4">
          {state.kind === 'loading' && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Confirmando preço e disponibilidade…
            </p>
          )}

          {state.kind === 'expired' && (
            <div className="space-y-4">
              <p className="text-base font-semibold text-slate-900">Esta oferta expirou</p>
              <p className="text-sm text-slate-600">Os preços mudam com frequência. Refaça a busca para ver as tarifas atuais.</p>
              <button
                type="button"
                onClick={onResearch}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                Refazer busca
              </button>
            </div>
          )}

          {state.kind === 'error' && <p className="text-sm text-red-700">{state.message}</p>}

          {state.kind === 'ready' && (
            <div className="space-y-4">
              <div>
                <p className="text-2xl font-extrabold tracking-tight text-slate-900">
                  {money(state.offer.totalPrice, state.offer.currency)}
                  <span className="ml-2 text-sm font-medium text-slate-500">
                    total · {passengerCount} {passengerCount > 1 ? 'passageiros' : 'passageiro'}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  {money(state.offer.price, state.offer.currency)} por pessoa
                </p>
                {priceChanged && (
                  <p className="mt-1 text-sm font-medium text-amber-700">
                    O preço mudou desde a busca (antes {money(flight.totalPrice, flight.currency)}).
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Válida até {timeFormatter.format(new Date(state.offer.expiresAt))}
                </p>
              </div>
              {/* The emissions bucket is relative to the search results, so keep the card's. */}
              <OfferDetails flight={{ ...state.offer, emissions: flight.emissions }} />
              {/* The re-fetched offer carries no miles: keep the card's valuation, flagged when the price moved. */}
              {flight.miles && (
                <MilesBlock
                  miles={flight.miles}
                  milheiro={milheiro}
                  label={priceChanged ? 'Valores da busca (preço mudou)' : undefined}
                />
              )}
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Reserva online em breve.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
