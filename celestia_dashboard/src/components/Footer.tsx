/** Where the privacy policy (privacidade.html) is served; see vercel.json and vite.config.ts. */
export const PRIVACY_URL = '/privacidade'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
        <p>
          © {new Date().getFullYear()} celest.ia · Compare voos com inteligência.
        </p>
        <nav aria-label="Rodapé">
          <a
            href={PRIVACY_URL}
            className="rounded transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Política de Privacidade
          </a>
        </nav>
      </div>
    </footer>
  )
}
