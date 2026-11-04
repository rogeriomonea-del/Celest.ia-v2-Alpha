import { Sparkles } from 'lucide-react'
import { UserMenu } from '../auth/UserMenu'
import type { SavedSearch } from '../features/savedSearches/types'

export interface HeaderProps {
  onSelectSavedSearch?: (saved: SavedSearch) => void
}

export function Header({ onSelectSavedSearch }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
              <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              celest<span className="text-indigo-600">.ia</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            <a
              href="/"
              aria-current="page"
              className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors"
            >
              Voos
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <UserMenu onSelectSavedSearch={onSelectSavedSearch} />
        </div>
      </div>
    </header>
  )
}
