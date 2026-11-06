/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://<ref>.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase public (anon/publishable) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
