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

function readRedirect(): { hadCode: boolean; errorDescription: string | null } {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const get = (key: string) => url.searchParams.get(key) ?? hash.get(key)
  return {
    hadCode: url.searchParams.has('code'),
    errorDescription: get('error_description') ?? get('error'),
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
        const message = redirect.errorDescription
          ? `Não foi possível entrar: ${redirect.errorDescription}`
          : redirect.hadCode && !current
            ? CALLBACK_FAILED
            : null
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
