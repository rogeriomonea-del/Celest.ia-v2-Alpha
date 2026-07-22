import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type BadgeTone = 'gold' | 'pine' | 'red' | 'amber' | 'ink' | 'green' | 'indigo' | 'emerald' | 'slate'

const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: 'bg-gold-200/[0.07] text-gold-200 ring-gold-200/25',
  pine: 'bg-pine-300/[0.07] text-pine-300 ring-pine-300/25',
  red: 'bg-red-300/[0.07] text-red-300 ring-red-300/25',
  amber: 'bg-amber-300/[0.07] text-amber-200 ring-amber-300/25',
  ink: 'bg-space-100/[0.045] text-space-200/75 ring-space-100/15',
  // aliases mantidos por compatibilidade (cores remapeadas no tema)
  green: 'bg-pine-300/[0.07] text-pine-300 ring-pine-300/25',
  indigo: 'bg-gold-200/[0.07] text-gold-200 ring-gold-200/25',
  emerald: 'bg-pine-300/[0.07] text-pine-300 ring-pine-300/25',
  slate: 'bg-space-100/[0.045] text-space-200/75 ring-space-100/15',
}

interface BadgeProps {
  tone: BadgeTone
  icon?: LucideIcon
  children: ReactNode
}

export function Badge({ tone, icon: Icon, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset backdrop-blur-sm ${TONE_CLASSES[tone]}`}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  )
}
