import { useCallback, useState } from 'react'
import { z } from 'zod'
import { milesRequestSchema } from '../../shared/api'
import { findMilesProgram } from '../../shared/miles'

/** The user's miles module preferences (not part of a search). */
export interface MilesPrefs {
  enabled: boolean
  /** Program code from src/shared/miles.ts. */
  program: string
  /** BRL per 1,000 miles; null = use the program default. */
  milheiroBrl: number | null
  balance: number
}

export const MILES_PREFS_KEY = 'celestia:miles'

export const DEFAULT_MILES_PREFS: MilesPrefs = {
  enabled: false,
  program: 'latampass',
  milheiroBrl: null,
  balance: 0,
}

const storedPrefsSchema = milesRequestSchema
  .extend({ enabled: z.boolean() })
  .refine((value) => findMilesProgram(value.program) !== null)

/** Milheiro used for valuations: the user's, else the program default, else none. */
export function effectiveMilheiro(prefs: Pick<MilesPrefs, 'program' | 'milheiroBrl'>): number | null {
  return prefs.milheiroBrl ?? findMilesProgram(prefs.program)?.defaultMilheiroBrl ?? null
}

function readPrefs(): MilesPrefs {
  try {
    const raw = window.localStorage.getItem(MILES_PREFS_KEY)
    if (raw === null) return DEFAULT_MILES_PREFS
    const parsed = storedPrefsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_MILES_PREFS
  } catch {
    return DEFAULT_MILES_PREFS
  }
}

/** Miles preferences persisted in localStorage; unreadable or invalid storage falls back to the defaults. */
export function useMilesPrefs(): { prefs: MilesPrefs; setPrefs: (prefs: MilesPrefs) => void } {
  const [prefs, setState] = useState<MilesPrefs>(readPrefs)

  const setPrefs = useCallback((next: MilesPrefs) => {
    setState(next)
    try {
      window.localStorage.setItem(MILES_PREFS_KEY, JSON.stringify(next))
    } catch {
      // Storage unavailable: the prefs last for this page only.
    }
  }, [])

  return { prefs, setPrefs }
}
