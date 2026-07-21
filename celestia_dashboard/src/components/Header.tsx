import { CircleUserRound, Globe, Sparkles } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Voos', active: true },
  { label: 'Hotéis', active: false },
  { label: 'Pacotes', active: false },
]

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-ink-50/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <a href="#" className="group flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 shadow-card ring-1 ring-inset ring-white/10">
              <Sparkles className="h-[18px] w-[18px] text-gold-400" aria-hidden="true" />
            </span>
            <span className="font-serif text-xl font-semibold tracking-tight text-ink-900">
              celest<span className="text-gold-600">.ia</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href="#"
                aria-current={item.active ? 'page' : undefined}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  item.active
                    ? 'bg-gold-50 text-gold-700'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'
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
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">BRL · pt-BR</span>
          </button>
          <button
            type="button"
            aria-label="Minha conta"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <CircleUserRound className="h-6 w-6" />
          </button>
        </div>
      </div>
    </header>
  )
}
