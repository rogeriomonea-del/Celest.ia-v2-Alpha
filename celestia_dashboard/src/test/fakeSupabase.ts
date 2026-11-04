import { vi } from 'vitest'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'

type Listener = (event: AuthChangeEvent, session: Session | null) => void

export function makeSession(user: Partial<User> = {}): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-01T00:00:00Z',
      ...user,
    },
  }
}

/** Minimal stand-in for the Supabase client's auth API used by AuthProvider. */
export function createFakeSupabase(initialSession: Session | null = null) {
  const listeners = new Set<Listener>()
  const emit = (event: AuthChangeEvent, session: Session | null) =>
    listeners.forEach((listener) => listener(event, session))
  const unsubscribe = vi.fn()

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: initialSession }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              unsubscribe()
              listeners.delete(listener)
            },
          },
        },
      }
    }),
    signInWithOAuth: vi.fn(
      async (_args: { provider: string; options?: { redirectTo?: string } }) =>
        ({ data: { provider: _args.provider, url: 'https://auth.invalid/authorize' }, error: null }) as {
          data: unknown
          error: Error | null
        },
    ),
    signOut: vi.fn(async () => {
      emit('SIGNED_OUT', null)
      return { error: null }
    }),
  }

  return { auth, from: vi.fn(), emit, unsubscribe }
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>
