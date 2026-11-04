import { createContext, useContext } from 'react'
import type { Usuario } from './api'

export interface ContextoUsuario {
  /** Usuário autenticado; `null` enquanto não há sessão. */
  usuario: Usuario | null
  /** Encerra a sessão no motor e recarrega a página. */
  sair: () => Promise<void>
}

export const UsuarioContext = createContext<ContextoUsuario>({
  usuario: null,
  sair: async () => {},
})

/** Usuário da sessão atual (fornecido pelo `LoginGate`). */
export function useUsuario(): ContextoUsuario {
  return useContext(UsuarioContext)
}

/** Iniciais para o avatar: "Maria Silva" → "MS"; sem nome usa o e-mail. */
export function iniciaisDe(usuario: Pick<Usuario, 'nome' | 'email'>): string {
  const base = (usuario.nome || usuario.email).trim()
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  }
  return base.slice(0, 2).toUpperCase()
}
