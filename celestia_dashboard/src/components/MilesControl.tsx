import { useEffect, useId, useRef, useState } from 'react'
import { Coins } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { effectiveMilheiro, type MilesPrefs } from '../features/miles/useMilesPrefs'
import { findMilesProgram, MILES_PROGRAMS } from '../shared/miles'
import { formatMilheiro, formatMiles } from '../utils/format'

interface MilesControlProps {
  prefs: MilesPrefs
  /** Saves the prefs (and re-runs the search, if one ran). */
  onApply: (prefs: MilesPrefs) => void
}

interface Draft {
  enabled: boolean
  program: string
  milheiro: string
  balance: string
}

const MAX_MILHEIRO = 1000
const MAX_BALANCE = 100_000_000

function defaultMilheiroText(program: string): string {
  const value = findMilesProgram(program)?.defaultMilheiroBrl
  return value == null ? '' : String(value)
}

function toDraft(prefs: MilesPrefs): Draft {
  const milheiro = effectiveMilheiro(prefs)
  return {
    enabled: prefs.enabled,
    program: prefs.program,
    milheiro: milheiro === null ? '' : String(milheiro),
    balance: prefs.balance > 0 ? String(prefs.balance) : '',
  }
}

/** Draft -> prefs, or an error message. Empty or default milheiro = null (follow the program default). */
function parseDraft(draft: Draft): MilesPrefs | string {
  let milheiroBrl: number | null = null
  const milheiroText = draft.milheiro.trim()
  if (milheiroText !== '' && milheiroText !== defaultMilheiroText(draft.program)) {
    const value = Number(milheiroText.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0 || value > MAX_MILHEIRO) return 'Milheiro inválido'
    milheiroBrl = value
  }
  const balance = parseBalance(draft.balance)
  if (balance === null || balance > MAX_BALANCE) return 'Saldo de milhas inválido'
  return { enabled: draft.enabled, program: draft.program, milheiroBrl, balance }
}

/** pt-BR balance text ("60.000", "60 000", "60000") -> miles; '' -> 0; anything else -> null. */
function parseBalance(text: string): number | null {
  const digits = text.replace(/[.\s]/g, '')
  if (digits === '') return 0
  return /^\d+$/.test(digits) ? Number(digits) : null
}

/** Trigger text: "Milhas: LATAM Pass · R$ 29" when enabled. */
function summary(prefs: MilesPrefs): string {
  if (!prefs.enabled) return 'Milhas'
  const name = findMilesProgram(prefs.program)?.name ?? prefs.program
  const milheiro = effectiveMilheiro(prefs)
  return milheiro === null ? `Milhas: ${name}` : `Milhas: ${name} · ${formatMilheiro(milheiro)}`
}

/** Popover with the miles module preferences. Mirrors PassengerSelector's open/close handling. */
export function MilesControl({ prefs, onApply }: MilesControlProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(prefs))
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const switchRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const programId = useId()
  const milheiroId = useId()
  const balanceId = useId()

  useClickOutside(containerRef, () => setOpen(false), open)

  useEffect(() => {
    if (open) switchRef.current?.focus()
  }, [open])

  const toggle = () => {
    if (!open) {
      setDraft(toDraft(prefs))
      setError(null)
    }
    setOpen((current) => !current)
  }

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close()
    }
  }

  const changeProgram = (program: string) => {
    setDraft((current) => ({
      ...current,
      program,
      // An untouched milheiro follows the newly selected program's default.
      milheiro:
        current.milheiro === defaultMilheiroText(current.program) ? defaultMilheiroText(program) : current.milheiro,
    }))
  }

  const parsedBalance = parseBalance(draft.balance)
  const balancePreview =
    parsedBalance === null || draft.balance.trim() === '' ? '' : `${formatMiles(parsedBalance)} milhas`

  const apply = () => {
    const parsed = parseDraft(draft)
    if (typeof parsed === 'string') {
      setError(parsed)
      return
    }
    onApply(parsed)
    close()
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
          prefs.enabled ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        <Coins className="h-4 w-4" aria-hidden="true" />
        {summary(prefs)}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Preferências de milhas"
          className="absolute left-0 top-full z-30 sm:left-auto sm:right-0 mt-2 w-[min(20rem,calc(100vw-3rem))] animate-pop space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10"
        >
          <div className="flex items-center justify-between">
            <span id={`${panelId}-switch`} className="text-sm font-semibold text-slate-900">
              Comparar com milhas
            </span>
            <button
              ref={switchRef}
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              aria-labelledby={`${panelId}-switch`}
              onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
              className={`relative h-6 w-11 rounded-full transition-colors ${draft.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${draft.enabled ? 'left-5' : 'left-0.5'}`}
              />
            </button>
          </div>

          <div>
            <label htmlFor={programId} className="mb-1 block text-xs font-semibold text-slate-600">
              Programa
            </label>
            <select
              id={programId}
              value={draft.program}
              onChange={(event) => changeProgram(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              {MILES_PROGRAMS.map((program) => (
                <option key={program.code} value={program.code}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={milheiroId} className="mb-1 block text-xs font-semibold text-slate-600">
              Milheiro (R$ por mil milhas)
            </label>
            <input
              id={milheiroId}
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_MILHEIRO}
              step="0.01"
              placeholder="informe"
              value={draft.milheiro}
              onChange={(event) => setDraft((current) => ({ ...current, milheiro: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label htmlFor={balanceId} className="mb-1 block text-xs font-semibold text-slate-600">
              Saldo de milhas
            </label>
            <div className="flex items-center gap-2">
              <input
                id={balanceId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-describedby={`${balanceId}-parsed`}
                value={draft.balance}
                onChange={(event) => setDraft((current) => ({ ...current, balance: event.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
              <span id={`${balanceId}-parsed`} className="shrink-0 text-xs text-slate-500">
                {balancePreview}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500">Milheiro = quanto você paga por 1.000 milhas (compra/transferência).</p>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={apply}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
