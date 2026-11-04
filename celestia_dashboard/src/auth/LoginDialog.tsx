import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { Loader2, X } from 'lucide-react'
import type { OAuthProvider } from './context'

export interface LoginDialogProps {
  isConfigured: boolean
  /** Message shown in the alert area (sign-in or OAuth redirect error). */
  error: string | null
  onSignIn: (provider: OAuthProvider) => Promise<{ error: string | null }>
  onClose: () => void
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 814 1000" width="16" height="19" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </svg>
  )
}

/** Modal with the Google / Apple sign-in buttons. Rendered by AuthProvider. */
export function LoginDialog({ isConfigured, error, onSignIn, onClose }: LoginDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const googleRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState<OAuthProvider | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const initialFocusRef = useRef(isConfigured ? googleRef : closeRef)

  // Focus moves in on open and back to the opener on close; Escape closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    initialFocusRef.current.current?.focus()
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

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    const inside = active instanceof Node && dialogRef.current.contains(active)
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault()
      first.focus()
    }
  }

  async function handleSignIn(provider: OAuthProvider) {
    if (pending || !isConfigured) return
    setPending(provider)
    const result = await onSignIn(provider)
    // On success the browser is redirected, so the spinner stays.
    if (result.error) setPending(null)
  }

  function providerButton(
    provider: OAuthProvider,
    label: string,
    logo: ReactNode,
    className: string,
    ref?: Ref<HTMLButtonElement>,
  ) {
    const isPending = pending === provider
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => void handleSignIn(provider)}
        disabled={!isConfigured}
        aria-busy={isPending || undefined}
        className={`flex h-11 w-full items-center justify-center gap-3 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : logo}
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      data-testid="login-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={trapTab}
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
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
          Entre na sua conta
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-slate-600">
          Salve suas buscas de voos e retome-as quando quiser, em qualquer dispositivo.
        </p>

        {!isConfigured && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            Login indisponível no momento
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {providerButton(
            'google',
            'Continuar com Google',
            <GoogleLogo />,
            'border border-[#747775] bg-white text-[#1F1F1F] hover:bg-slate-50',
            googleRef,
          )}
          {providerButton(
            'apple',
            'Continuar com Apple',
            <AppleLogo />,
            'bg-black text-white hover:bg-neutral-800',
          )}
        </div>

        <div role="alert" className="text-sm text-red-700 [&:not(:empty)]:mt-4">
          {error}
        </div>
      </div>
    </div>
  )
}
