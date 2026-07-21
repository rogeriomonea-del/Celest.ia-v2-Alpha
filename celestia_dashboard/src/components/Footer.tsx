import { Sparkles } from 'lucide-react'

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-9 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900">
            <Sparkles className="h-3.5 w-3.5 text-gold-400" aria-hidden="true" />
          </span>
          <p className="text-sm text-ink-500">
            <span className="font-serif font-semibold text-ink-800">
              celest<span className="text-gold-600">.ia</span>
            </span>{' '}
            © {new Date().getFullYear()} · Compare voos com inteligência.
          </p>
        </div>
        <nav className="flex gap-6 text-sm text-ink-500" aria-label="Rodapé">
          <a href="#" className="transition-colors hover:text-ink-900">
            Sobre
          </a>
          <a href="#" className="transition-colors hover:text-ink-900">
            Ajuda
          </a>
          <a href="#" className="transition-colors hover:text-ink-900">
            Privacidade
          </a>
        </nav>
      </div>
    </footer>
  )
}
