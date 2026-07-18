export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
        <p>
          © {new Date().getFullYear()} celest.ia · Compare voos com inteligência.
        </p>
        <nav className="flex gap-6" aria-label="Rodapé">
          <a href="#" className="transition-colors hover:text-slate-900">
            Sobre
          </a>
          <a href="#" className="transition-colors hover:text-slate-900">
            Ajuda
          </a>
          <a href="#" className="transition-colors hover:text-slate-900">
            Privacidade
          </a>
        </nav>
      </div>
    </footer>
  )
}
