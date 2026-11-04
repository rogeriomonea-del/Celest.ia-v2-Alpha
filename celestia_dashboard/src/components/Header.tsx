import { useRef, useState } from 'react'
import { CircleUserRound, Globe, LogOut, Sparkles } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { iniciaisDe, useUsuario } from '../auth/UsuarioContext'

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
          <MenuConta />
        </div>
      </div>
    </header>
  )
}

/** Botão de conta: avatar/iniciais abre menu com e-mail e "Sair"; sem sessão mostra "Entrar". */
function MenuConta() {
  const { usuario, sair } = useUsuario()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setAberto(false), aberto)

  if (!usuario) {
    // Sem sessão o LoginGate já mostra a tela de login; recarregar leva até ela.
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
      >
        <CircleUserRound className="h-5 w-5" aria-hidden="true" />
        Entrar
      </button>
    )
  }

  const rotulo = usuario.nome || usuario.email

  const aoSair = async () => {
    setSaindo(true)
    await sair()
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && aberto) {
          evento.stopPropagation()
          setAberto(false)
        }
      }}
    >
      <button
        type="button"
        aria-label={`Minha conta: ${rotulo}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
        className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-xs font-bold transition-colors ${
          aberto ? 'ring-2 ring-indigo-600/30' : ''
        } ${usuario.avatar_url ? '' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
      >
        {usuario.avatar_url ? (
          <img
            src={usuario.avatar_url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-9 w-9 object-cover"
          />
        ) : (
          iniciaisDe(usuario)
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Conta"
          className="absolute right-0 top-full z-30 mt-2 w-64 animate-pop rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
        >
          <div className="px-3 py-2">
            {usuario.nome && (
              <p className="truncate text-sm font-semibold text-slate-900">{usuario.nome}</p>
            )}
            <p className="truncate text-xs text-slate-500" title={usuario.email}>
              {usuario.email}
            </p>
            {usuario.admin && (
              <span className="mt-1.5 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                Administrador
              </span>
            )}
          </div>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            disabled={saindo}
            onClick={() => void aoSair()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {saindo ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      )}
    </div>
  )
}
