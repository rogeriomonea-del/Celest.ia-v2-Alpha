import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  Mail,
  Sparkles,
} from 'lucide-react'
import {
  ErroAuth,
  obterConfig,
  pedirCodigo,
  urlLoginGoogle,
  verificarCodigo,
  type ConfigAuth,
  type ModoEnvio,
  type Usuario,
} from './api'

interface TelaLoginProps {
  onLogin: (usuario: Usuario) => void
}

type Etapa = 'email' | 'codigo'

const TAMANHO_CODIGO = 6
const ESPERA_REENVIO_S = 60
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mensagens para `?erro=` vindo do retorno do Google. */
const ERROS_DA_URL: Record<string, string> = {
  google_cancelado: 'O login com Google foi cancelado. Você pode tentar de novo.',
  google_expirado:
    'O login com Google demorou demais ou foi aberto em outro navegador. Comece de novo por aqui.',
  google_falhou: 'O Google não concluiu o login. Tente de novo ou entre com o código por e-mail.',
  conta_inativa:
    'Sua conta foi criada e aguarda aprovação do administrador. Tente entrar de novo quando ela for aprovada.',
}

/** Lê e remove `?erro=` da URL para a mensagem não reaparecer ao recarregar. */
function consumirErroDaUrl(): string | null {
  const url = new URL(window.location.href)
  const codigo = url.searchParams.get('erro')
  if (!codigo) return null
  url.searchParams.delete('erro')
  window.history.replaceState(window.history.state, '', url.toString())
  return ERROS_DA_URL[codigo] ?? 'Não foi possível concluir o login. Tente de novo.'
}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroAuth) return erro.message
  return 'Algo deu errado. Tente de novo.'
}

function Aviso({
  tom,
  children,
}: {
  tom: 'erro' | 'info' | 'sucesso'
  children: React.ReactNode
}) {
  const classes = {
    erro: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-amber-200 bg-amber-50 text-amber-800',
    sucesso: 'border-green-200 bg-green-50 text-green-800',
  }[tom]
  const Icone = { erro: AlertTriangle, info: Info, sucesso: CheckCircle2 }[tom]
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm ${classes}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

function IconeGoogle() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.55 5.55 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.36v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.35 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.36a12 12 0 0 0 0 10.8l3.99-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A12 12 0 0 0 1.36 6.6l3.99 3.09A7.2 7.2 0 0 1 12 4.77z"
      />
    </svg>
  )
}

export function TelaLogin({ onLogin }: TelaLoginProps) {
  const [config, setConfig] = useState<ConfigAuth | null>(null)
  const [etapa, setEtapa] = useState<Etapa>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [modoEnvio, setModoEnvio] = useState<ModoEnvio | null>(null)
  const [mensagemEnvio, setMensagemEnvio] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(() => consumirErroDaUrl())
  const [ocupado, setOcupado] = useState(false)
  const [segundosReenvio, setSegundosReenvio] = useState(0)
  const campoCodigoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ativo = true
    obterConfig()
      .then((dados) => {
        if (ativo) setConfig(dados)
      })
      .catch(() => {
        // Sem config: assume só código por e-mail, sem Google.
        if (ativo) setConfig({ codigo_email: true, google: false, envio_real: true, url_base: '' })
      })
    return () => {
      ativo = false
    }
  }, [])

  useEffect(() => {
    if (segundosReenvio <= 0) return
    const timer = setTimeout(() => setSegundosReenvio((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [segundosReenvio])

  useEffect(() => {
    if (etapa === 'codigo') campoCodigoRef.current?.focus()
  }, [etapa])

  const enviarCodigo = async () => {
    const emailLimpo = email.trim().toLowerCase()
    if (!REGEX_EMAIL.test(emailLimpo)) {
      setErro('Informe um e-mail válido.')
      return
    }
    setErro(null)
    setOcupado(true)
    try {
      const resposta = await pedirCodigo(emailLimpo)
      setEmail(emailLimpo)
      setModoEnvio(resposta.modo)
      setMensagemEnvio(resposta.mensagem)
      setCodigo('')
      setEtapa('codigo')
      setSegundosReenvio(ESPERA_REENVIO_S)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  const verificar = async () => {
    if (codigo.length !== TAMANHO_CODIGO) {
      setErro(`Digite os ${TAMANHO_CODIGO} dígitos do código.`)
      return
    }
    setErro(null)
    setOcupado(true)
    try {
      const usuario = await verificarCodigo(email, codigo)
      onLogin(usuario)
    } catch (falha) {
      if (falha instanceof ErroAuth && falha.status === 403) {
        // Conta pendente de aprovação ou desativada: mensagem do motor.
        setErro(falha.message)
      } else {
        setErro(mensagemDoErro(falha))
      }
      setCodigo('')
      campoCodigoRef.current?.focus()
    } finally {
      setOcupado(false)
    }
  }

  const aoEnviarEmail = (evento: FormEvent) => {
    evento.preventDefault()
    if (!ocupado) void enviarCodigo()
  }

  const aoEnviarCodigo = (evento: FormEvent) => {
    evento.preventDefault()
    if (!ocupado) void verificar()
  }

  const aoDigitarCodigo = (valor: string) => {
    // Aceita colar "123 456" ou "123-456": mantém só dígitos.
    setCodigo(valor.replace(/\D/g, '').slice(0, TAMANHO_CODIGO))
  }

  const aoTeclarCodigo = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Enter') {
      evento.preventDefault()
      if (!ocupado) void verificar()
    }
  }

  const voltarParaEmail = () => {
    setEtapa('email')
    setCodigo('')
    setErro(null)
    setModoEnvio(null)
    setMensagemEnvio(null)
  }

  const entrarComGoogle = () => {
    // 302 do motor para o Google: navegação completa, não fetch.
    window.location.href = urlLoginGoogle(window.location.href, config?.url_base ?? '')
  }

  const classeInput =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 disabled:bg-slate-50'
  const classeBotaoPrimario =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 pb-28 pt-12 sm:pt-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
          <div className="mb-6 inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 shadow-sm ring-1 ring-white/20">
              <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <span className="text-xl font-extrabold tracking-tight text-white">
              celest<span className="text-indigo-200">.ia</span>
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Entre para buscar voos
          </h1>
          <p className="mt-2 text-sm text-indigo-100 sm:text-base">
            Sua conta vale para a plataforma de voos e para a área financeira.
          </p>
        </div>
      </section>

      {/* Cartão */}
      <main className="relative z-10 -mt-20 flex-1 px-4 pb-16 sm:px-6">
        <div className="mx-auto w-full max-w-md animate-fade-up rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10 sm:p-8">
          {etapa === 'email' ? (
            <form onSubmit={aoEnviarEmail} noValidate className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Receba um código por e-mail</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sem senha: enviamos um código de {TAMANHO_CODIGO} dígitos para confirmar que é
                  você.
                </p>
              </div>

              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    autoFocus
                    required
                    value={email}
                    disabled={ocupado}
                    onChange={(evento) => setEmail(evento.target.value)}
                    placeholder="voce@exemplo.com"
                    className={`${classeInput} pl-10`}
                  />
                </div>
              </div>

              <div aria-live="assertive" aria-atomic="true">
                {erro && <Aviso tom="erro">{erro}</Aviso>}
              </div>

              <button type="submit" disabled={ocupado} className={classeBotaoPrimario}>
                {ocupado ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                {ocupado ? 'Enviando…' : 'Enviar código'}
              </button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    ou
                  </span>
                </div>
              </div>

              {config === null ? (
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
              ) : config.google ? (
                <button
                  type="button"
                  onClick={entrarComGoogle}
                  disabled={ocupado}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconeGoogle />
                  Entrar com Google
                </button>
              ) : (
                <p className="text-center text-xs text-slate-400">
                  Google não configurado neste servidor
                </p>
              )}

              {config && !config.envio_real && (
                <p className="text-center text-xs text-slate-400">
                  SMTP não configurado: o código aparecerá no log do servidor.
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={aoEnviarCodigo} noValidate className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Digite o código</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enviamos um código de {TAMANHO_CODIGO} dígitos para{' '}
                  <span className="font-semibold text-slate-700">{email}</span>.
                </p>
              </div>

              {modoEnvio === 'log' ? (
                <Aviso tom="info">
                  SMTP não configurado: o código foi gravado no log do servidor.
                </Aviso>
              ) : (
                mensagemEnvio && <Aviso tom="sucesso">{mensagemEnvio}</Aviso>
              )}

              <div>
                <label htmlFor="login-codigo" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Código de {TAMANHO_CODIGO} dígitos
                </label>
                <input
                  ref={campoCodigoRef}
                  id="login-codigo"
                  type="text"
                  name="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={TAMANHO_CODIGO}
                  autoFocus
                  required
                  value={codigo}
                  disabled={ocupado}
                  onChange={(evento) => aoDigitarCodigo(evento.target.value)}
                  onKeyDown={aoTeclarCodigo}
                  placeholder="000000"
                  aria-describedby="login-codigo-dica"
                  className={`${classeInput} text-center font-mono text-2xl font-bold tracking-[0.5em] placeholder:tracking-[0.5em]`}
                />
                <p id="login-codigo-dica" className="mt-1.5 text-xs text-slate-400">
                  Você pode colar o código. Pressione Enter para confirmar.
                </p>
              </div>

              <div aria-live="assertive" aria-atomic="true">
                {erro && <Aviso tom="erro">{erro}</Aviso>}
              </div>

              <button
                type="submit"
                disabled={ocupado || codigo.length !== TAMANHO_CODIGO}
                className={classeBotaoPrimario}
              >
                {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {ocupado ? 'Verificando…' : 'Entrar'}
              </button>

              <div className="flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={voltarParaEmail}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1 font-semibold text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Trocar e-mail
                </button>
                <button
                  type="button"
                  onClick={() => void enviarCodigo()}
                  disabled={ocupado || segundosReenvio > 0}
                  aria-live="polite"
                  className="font-semibold text-indigo-600 transition-colors hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {segundosReenvio > 0 ? `Reenviar em ${segundosReenvio}s` : 'Reenviar código'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mx-auto mt-6 max-w-md text-center text-xs text-slate-400">
          Contas novas ficam aguardando aprovação de um administrador.
        </p>
      </main>
    </div>
  )
}
