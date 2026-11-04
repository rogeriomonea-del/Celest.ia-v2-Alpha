/**
 * Cliente das rotas de autenticação do motor celest.ia (`/api/py/auth/*`).
 *
 * As chamadas são same-origin: em dev o Vite faz proxy de `/api/py` para o
 * motor Python; em produção o nginx faz o mesmo. O cookie de sessão
 * `celestia_sessao` é HttpOnly e vale para os dois domínios (voos e finanças),
 * por isso basta `credentials: "include"`.
 *
 * Nunca registrar e-mail, código ou token no console.
 */

export interface Usuario {
  id: number
  email: string
  nome: string
  avatar_url: string | null
  admin: boolean
  ativo: boolean
}

export interface ConfigAuth {
  codigo_email: boolean
  google: boolean
  /** `false` ⇒ SMTP não configurado: o código sai no log do servidor. */
  envio_real: boolean
  url_base: string
}

export type ModoEnvio = 'email' | 'log'

export interface RespostaCodigo {
  enviado: boolean
  modo: ModoEnvio
  mensagem: string
}

/** Erro de autenticação com status HTTP e mensagem pt-BR vinda do motor. */
export class ErroAuth extends Error {
  readonly status: number

  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.name = 'ErroAuth'
    this.status = status
  }

  /** `true` quando a falha foi de rede/serviço (não uma resposta do motor). */
  get indisponivel(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504
  }
}

const BASE = '/api/py/auth'

const MENSAGEM_PADRAO: Record<number, string> = {
  0: 'Serviço de login indisponível. Verifique sua conexão e tente de novo.',
  400: 'Pedido inválido.',
  401: 'Não autenticado.',
  403: 'Sua conta foi criada e aguarda aprovação do administrador.',
  429: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  500: 'Erro interno no serviço de login.',
  501: 'Recurso não configurado neste servidor.',
  502: 'Não foi possível enviar o e-mail. Tente de novo em instantes.',
}

async function requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new ErroAuth(0, MENSAGEM_PADRAO[0])
  }

  let corpo: unknown = null
  const texto = await resposta.text()
  if (texto) {
    try {
      corpo = JSON.parse(texto)
    } catch {
      corpo = null
    }
  }

  if (!resposta.ok) {
    const erroCorpo =
      corpo && typeof corpo === 'object' && typeof (corpo as { erro?: unknown }).erro === 'string'
        ? (corpo as { erro: string }).erro
        : null
    // Proxy fora do ar devolve HTML (502/503/504): tratar como indisponível.
    if (!erroCorpo && (resposta.status === 502 || resposta.status === 503 || resposta.status === 504)) {
      throw new ErroAuth(resposta.status, MENSAGEM_PADRAO[0])
    }
    throw new ErroAuth(
      resposta.status,
      erroCorpo ?? MENSAGEM_PADRAO[resposta.status] ?? `Erro ${resposta.status} no serviço de login.`,
    )
  }

  return corpo as T
}

export function obterConfig(): Promise<ConfigAuth> {
  return requisitar<ConfigAuth>('/config')
}

export function pedirCodigo(email: string): Promise<RespostaCodigo> {
  return requisitar<RespostaCodigo>('/codigo', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function verificarCodigo(email: string, codigo: string): Promise<Usuario> {
  const dados = await requisitar<{ usuario: Usuario }>('/verificar', {
    method: 'POST',
    body: JSON.stringify({ email, codigo }),
  })
  return dados.usuario
}

/** Usuário da sessão atual; lança `ErroAuth` 401 sem sessão. */
export async function eu(): Promise<Usuario> {
  const dados = await requisitar<{ usuario: Usuario }>('/eu')
  return dados.usuario
}

export async function sair(): Promise<void> {
  await requisitar<{ ok: boolean }>('/sair', { method: 'POST' })
}

export async function sairDeTudo(): Promise<number> {
  const dados = await requisitar<{ ok: boolean; sessoes_encerradas: number }>('/sair-de-tudo', {
    method: 'POST',
  })
  return dados.sessoes_encerradas
}

/**
 * URL que inicia o login com Google. Navegar com `window.location.href`
 * (o motor responde 302 para o Google — não usar `fetch`). O destino é a URL
 * absoluta da plataforma de voos, permitida porque o host termina com o
 * domínio do cookie.
 */
export function urlLoginGoogle(
  destino: string = window.location.href,
  urlBase: string = '',
): string {
  // Quando o motor informa a URL pública do app financeiro, o fluxo começa
  // lá: é nesse host que o Google devolve o usuário, então o cookie que
  // amarra o login ao navegador já nasce no lugar certo.
  const base = urlBase.replace(/\/+$/, '')
  const prefixo = base ? `${base}${BASE}` : BASE
  return `${prefixo}/google?destino=${encodeURIComponent(destino)}`
}
