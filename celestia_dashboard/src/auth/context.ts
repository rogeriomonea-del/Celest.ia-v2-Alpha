import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type OAuthProvider = 'google' | 'apple'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  /** True until the initial session (incl. an OAuth redirect) is resolved. */
  loading: boolean
  /** False when Supabase env vars are missing. */
  isConfigured: boolean
  /** Starts the OAuth redirect. Resolves with an error message if it could not start. */
  signIn: (provider: OAuthProvider) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
