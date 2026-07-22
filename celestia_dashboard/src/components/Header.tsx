import { UserRound } from 'lucide-react'
import type { ApiMode } from '../types'

interface HeaderProps {
  apiMode: ApiMode | null
}

const MODE_LABELS: Record<ApiMode, string> = {
  real: 'Motor online',
  mock: 'Motor em demonstração',
  off: 'Demonstração local',
}

export function Header({ apiMode }: HeaderProps) {
  const statusLabel = apiMode ? MODE_LABELS[apiMode] : 'Conectando ao motor'
  const statusTone =
    apiMode === 'real'
      ? 'bg-aqua-300 shadow-[0_0_14px_rgba(85,230,230,.72)]'
      : apiMode === null
        ? 'animate-pulse bg-gold-300'
        : 'bg-gold-300'

  return (
    <header className="absolute inset-x-0 top-0 z-50 text-white">
      <div className="flex h-[6.5rem] items-center justify-between px-4 sm:px-6 lg:pl-[6.75rem] lg:pr-10">
        <div className="flex items-center gap-8 lg:gap-20">
          <a
            href="#topo"
            aria-label="celest.ia, início"
            className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300"
          >
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.025]">
              <span className="absolute h-9 w-9 rotate-[26deg] rounded-full border border-gold-300/50" />
              <span className="absolute h-7 w-11 -rotate-[22deg] rounded-[50%] border border-aqua-200/35" />
              <span className="h-1.5 w-1.5 rounded-full border border-[#f5ecdd]/80 bg-[#f5ecdd]/20 shadow-[0_0_9px_rgba(245,236,221,.5)]" />
              <span className="absolute right-0 top-1 h-1.5 w-1.5 rounded-full bg-aqua-300 shadow-[0_0_12px_rgba(85,230,230,.95)]" />
            </span>
            <span className="font-serif text-[2rem] font-light tracking-[-0.045em] text-[#f6efe1]">
              celest.ia
            </span>
          </a>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Principal">
            <a href="#buscar" className="nav-link-dark">Explorar</a>
            <a href="#resultados" className="nav-link-dark">Jornadas</a>
            <a href="#estrategias" className="nav-link-dark">Inteligência</a>
          </nav>
        </div>

        <div className="flex items-center gap-4 sm:gap-7">
          <div
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2 text-[11px] font-medium text-space-100"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone}`} aria-hidden="true" />
            <span className="hidden sm:inline">{statusLabel}</span>
            <span className="sm:hidden">{apiMode === null ? 'Conectando' : apiMode === 'real' ? 'Online' : 'Demo'}</span>
          </div>
          <span aria-hidden="true" className="hidden h-8 w-px bg-white/15 sm:block" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.025] text-space-100">
            <UserRound className="h-5 w-5" aria-hidden="true" />
            <span className="absolute bottom-1 right-0 h-1.5 w-1.5 rounded-full bg-aqua-300 shadow-[0_0_12px_rgba(85,230,230,.9)]" />
          </span>
        </div>
      </div>
    </header>
  )
}
