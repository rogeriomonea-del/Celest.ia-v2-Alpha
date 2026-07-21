import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type BadgeTone = 'gold' | 'pine' | 'red' | 'amber' | 'ink' | 'green' | 'indigo' | 'emerald' | 'slate'

const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: 'bg-gold-50 text-gold-700 ring-gold-600/25',
  pine: 'bg-pine-50 text-pine-700 ring-pine-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/25',
  ink: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  // aliases mantidos por compatibilidade (cores remapeadas no tema)
  green: 'bg-pine-50 text-pine-700 ring-pine-600/20',
  indigo: 'bg-gold-50 text-gold-700 ring-gold-600/25',
  emerald: 'bg-pine-50 text-pine-700 ring-pine-600/20',
  slate: 'bg-ink-100 text-ink-600 ring-ink-500/20',
}

interface BadgeProps {
  tone: BadgeTone
  icon?: LucideIcon
  children: ReactNode
}

export function Badge({ tone, icon: Icon, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  )
}
