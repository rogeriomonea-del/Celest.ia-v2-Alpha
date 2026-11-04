import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, Sparkles, WifiOff } from 'lucide-react'
import { ErroAuth, eu, sair as sairDaApi, type Usuario } from './api'
import { TelaLogin } from './TelaLogin'
import { UsuarioContext, type ContextoUsuario } from './UsuarioContext'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'sem_sessao' }
  | { tipo: 'indisponivel'; mensagem: string }
  | { tipo: 'logado'; usuario: Usuario }

interface LoginGateProps {
  children: ReactNode
}

/**
 * Portão de autenticação da plataforma de voos.
 *
 * Na montagem consulta `/api/py/auth/eu`: com sessão válida renderiza os
 * filhos (e expõe o usuário via `useUsuario`); com 401 mostra a tela de
 * login; se o serviço não responde, mostra um aviso com "Tentar de novo" em
 * vez de deixar a tela em branco.
 */
export function LoginGate({ children }: LoginGateProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  const verificarSessao = useCallback(async () => {
    setEstado({ tipo: 'carregando' })
    try {
      const usuario = await eu()
      setEstado({ tipo: 'logado', usuario })
    } catch (falha) {
      if (falha instanceof ErroAuth && falha.status === 401) {
        setEstado({ tipo: 'sem_sessao' })
      } else if (falha instanceof ErroAuth && falha.status === 403) {
        // Conta desativada no meio da sessão: trata como sem sessão.
        setEstado({ tipo: 'sem_sessao' })
      } else {
        setEstado({
          tipo: 'indisponivel',
          mensagem:
            falha instanceof ErroAuth && !falha.indisponivel
              ? falha.message
              : 'Serviço de login indisponível. Verifique sua conexão e tente de novo.',
        })
      }
    }
  }, [])

  useEffect(() => {
    void verificarSessao()
  }, [verificarSessao])

  const sair = useCallback(async () => {
    try {
      await sairDaApi()
    } catch {
      // Mesmo que o motor falhe, recarregar força a nova checagem de sessão.
    } finally {
      window.location.reload()
    }
  }, [])

  const contexto = useMemo<ContextoUsuario>(
    () => ({ usuario: estado.tipo === 'logado' ? estado.usuario : null, sair }),
    [estado, sair],
  )

  if (estado.tipo === 'carregando') {
    return <Splash />
  }

  if (estado.tipo === 'indisponivel') {
    return <ServicoIndisponivel mensagem={estado.mensagem} onTentar={() => void verificarSessao()} />
  }

  if (estado.tipo === 'sem_sessao') {
    return <TelaLogin onLogin={(usuario) => setEstado({ tipo: 'logado', usuario })} />
  }

  return <UsuarioContext.Provider value={contexto}>{children}</UsuarioContext.Provider>
}

function Splash() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
        <Sparkles className="h-6 w-6 text-white" aria-hidden="true" />
      </span>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden="true" />
        Verificando sua sessão…
      </div>
    </div>
  )
}

function ServicoIndisponivel({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div
        role="alert"
        className="flex w-full max-w-md flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
      >
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <WifiOff className="h-7 w-7 text-amber-600" aria-hidden="true" />
        </span>
        <h1 className="text-base font-bold text-slate-900">Serviço de login indisponível</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{mensagem}</p>
        <button
          type="button"
          onClick={onTentar}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
