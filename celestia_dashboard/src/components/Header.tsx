import { CircleUserRound, Globe, Sparkles } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Voos', active: true },
  { label: 'Hotéis', active: false },
  { label: 'Pacotes', active: false },
]

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <a href="#" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
              <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              celest<span className="text-indigo-600">.ia</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href="#"
                aria-current={item.active ? 'page' : undefined}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  item.active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            aria-label="Idioma e moeda: BRL, português (Brasil)"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">BRL · pt-BR</span>
          </button>
          <button
            type="button"
            aria-label="Minha conta"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
          >
            <CircleUserRound className="h-6 w-6" />
          </button>
        </div>
      </div>
    </header>
  )
}
