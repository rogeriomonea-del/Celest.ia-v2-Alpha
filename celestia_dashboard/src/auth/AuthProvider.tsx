import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isAuthConfigured, supabase } from '../lib/supabase'
import { SavedSearchesProvider } from '../features/savedSearches/useSavedSearches'
import { AuthContext, type AuthContextValue, type OAuthProvider } from './context'
import { LoginDialog } from './LoginDialog'

export { useAuth } from './context'
export type { AuthContextValue, OAuthProvider } from './context'

const UNAVAILABLE = 'Login indisponível no momento'
const START_FAILED = 'Não foi possível iniciar o login. Tente novamente.'
const CALLBACK_FAILED = 'Não foi possível concluir o login. Tente novamente.'

/** OAuth callback params left in the URL by Supabase (query or hash). */
const REDIRECT_PARAMS = ['code', 'error', 'error_code', 'error_description']

/**
 * Fixed messages for known OAuth/Supabase error codes. The URL's
 * error_description is attacker-controllable and is never displayed.
 */
const INTERRUPTED = 'O login expirou ou foi interrompido. Tente novamente.'
const ERROR_CODE_MESSAGES = new Map<string, string>([
  ['bad_oauth_state', INTERRUPTED],
  ['bad_oauth_callback', INTERRUPTED],
  ['flow_state_expired', INTERRUPTED],
  ['flow_state_not_found', INTERRUPTED],
  ['signup_disabled', 'Novos cadastros estão desativados no momento.'],
  ['provider_disabled', 'Este provedor de login está desativado no momento.'],
  ['email_not_confirmed', 'Confirme seu e-mail com o provedor de login e tente novamente.'],
])

/** Fixed messages for standard OAuth 2.0 `error` values. */
const PROVIDER_DOWN = 'O provedor de login está indisponível no momento. Tente novamente mais tarde.'
const ERROR_MESSAGES = new Map<string, string>([
  ['access_denied', 'O acesso foi negado ou o login foi cancelado. Tente novamente.'],
  ['server_error', PROVIDER_DOWN],
  ['temporarily_unavailable', PROVIDER_DOWN],
])

function readRedirect(): { hadCode: boolean; errorMessage: string | null } {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const get = (key: string) => url.searchParams.get(key) ?? hash.get(key)
  const error = get('error')
  const errorCode = get('error_code')
  const failed = error !== null || errorCode !== null || get('error_description') !== null
  return {
    hadCode: url.searchParams.has('code'),
    errorMessage: failed
      ? (ERROR_CODE_MESSAGES.get(errorCode ?? '') ?? ERROR_MESSAGES.get(error ?? '') ?? CALLBACK_FAILED)
      : null,
  }
}

function stripRedirectParams() {
  const url = new URL(window.location.href)
  let changed = false
  for (const key of REDIRECT_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  const hash = new URLSearchParams(url.hash.slice(1))
  if (hash.has('access_token') || REDIRECT_PARAMS.some((key) => hash.has(key))) {
    url.hash = ''
    changed = true
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString())
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    const redirect = readRedirect()

    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      if (next) setLoginOpen(false)
    })

    // getSession waits for the client to finish processing an OAuth redirect.
    client.auth
      .getSession()
      .then(({ data: { session: current } }) => current)
      .catch(() => null)
      .then((current) => {
        if (!active) return
        setSession(current)
        setLoading(false)
        stripRedirectParams()
        const message =
          redirect.errorMessage ??
          (redirect.hadCode && !current
            ? CALLBACK_FAILED
            : null)
        if (message) {
          setError(message)
          setLoginOpen(true)
        }
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (provider: OAuthProvider) => {
    if (!supabase) {
      setError(UNAVAILABLE)
      return { error: UNAVAILABLE }
    }
    setError(null)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + window.location.pathname },
      })
      if (!oauthError) return { error: null }
    } catch {
      // fall through
    }
    setError(START_FAILED)
    return { error: START_FAILED }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const openLogin = useCallback(() => {
    setError(null)
    setLoginOpen(true)
  }, [])

  const closeLogin = useCallback(() => {
    setLoginOpen(false)
    setError(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isConfigured: isAuthConfigured,
      signIn,
      signOut,
      loginOpen,
      openLogin,
      closeLogin,
    }),
    [session, loading, signIn, signOut, loginOpen, openLogin, closeLogin],
  )

  return (
    <AuthContext.Provider value={value}>
      <SavedSearchesProvider>{children}</SavedSearchesProvider>
      {loginOpen && (
        <LoginDialog
          isConfigured={isAuthConfigured}
          error={error}
          onSignIn={signIn}
          onClose={closeLogin}
        />
      )}
    </AuthContext.Provider>
  )
}
