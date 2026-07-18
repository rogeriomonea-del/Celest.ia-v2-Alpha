import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type BadgeTone = 'green' | 'red' | 'indigo' | 'amber' | 'slate' | 'emerald'

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
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
