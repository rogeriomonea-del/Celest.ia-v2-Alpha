/** Response helpers and error mapping for the api/ functions. User-facing messages are pt-BR. */
import type { ZodError } from 'zod'
import type { ApiErrorBody, ApiErrorCode } from '../src/shared/api.js'
import { DuffelError } from './duffel.js'

export const NO_STORE = { 'Cache-Control': 'no-store' }

export const MESSAGES = {
  notConfigured: 'A busca de voos está temporariamente indisponível. Tente novamente mais tarde.',
  invalidBody: 'Requisição inválida: envie um JSON válido.',
  providerRejected: 'Não foi possível buscar com esses dados. Revise origem, destino, datas e passageiros.',
  offerExpired: 'Esta oferta expirou ou não está mais disponível. Faça uma nova busca.',
  notFound: 'Não encontramos o que você procurou. Faça uma nova busca.',
  providerError: 'O serviço de voos não respondeu. Tente novamente em instantes.',
  internal: 'Ocorreu um erro inesperado. Tente novamente.',
  methodNotAllowed: 'Método não permitido.',
} as const

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  const body: ApiErrorBody = { error: { code, message } }
  return json(body, status, { ...NO_STORE, ...headers })
}

/** Thrown when the request body is not valid JSON. */
export class InvalidBodyError extends Error {
  constructor() {
    super('Invalid JSON body')
    this.name = 'InvalidBodyError'
  }
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  const text = await request.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new InvalidBodyError()
  }
}

/** 400 with the first zod issue's message (already pt-BR in the shared schema). */
export function validationErrorResponse(error: ZodError): Response {
  return errorResponse('invalid_request', error.issues[0]?.message ?? MESSAGES.invalidBody, 400)
}

/** Handler for HTTP methods a route does not support. */
export function methodNotAllowed(allowed: string[]): (request: Request) => Response {
  return () => errorResponse('method_not_allowed', MESSAGES.methodNotAllowed, 405, { Allow: allowed.join(', ') })
}

const OFFER_GONE_CODES = new Set(['offer_no_longer_available', 'offer_expired'])

/** Maps any thrown error to an ApiErrorBody response. `offerLookup` enables 410 for gone offers. */
export function handleError(err: unknown, options: { offerLookup?: boolean } = {}): Response {
  if (err instanceof InvalidBodyError) {
    return errorResponse('invalid_request', MESSAGES.invalidBody, 400)
  }
  if (!(err instanceof DuffelError)) {
    console.error('[api] unexpected error', err instanceof Error ? err.name : typeof err)
    return errorResponse('internal', MESSAGES.internal, 500)
  }

  if (err.kind !== 'not_configured') {
    console.error('[duffel]', err.kind, err.status ?? '', err.code ?? '', err.message)
  }
  if (err.kind === 'not_configured') {
    return errorResponse('provider_not_configured', MESSAGES.notConfigured, 503)
  }
  if (err.kind === 'network' || err.kind === 'timeout') {
    return errorResponse('provider_error', MESSAGES.providerError, 502)
  }

  const status = err.status ?? 0
  // Bad or revoked token: same outcome for users as a missing one.
  if (status === 401 || status === 403) {
    console.error(`[duffel] Duffel credential rejected (HTTP ${status}): check DUFFEL_ACCESS_TOKEN`)
    return errorResponse('provider_not_configured', MESSAGES.notConfigured, 503)
  }
  if (options.offerLookup && err.code && OFFER_GONE_CODES.has(err.code)) {
    return errorResponse('offer_expired', MESSAGES.offerExpired, 410)
  }
  if (status === 404) return errorResponse('not_found', MESSAGES.notFound, 404)
  if (status === 400 || status === 422) {
    return errorResponse('invalid_request', MESSAGES.providerRejected, 400)
  }
  // 429 (rate limited) is transient on Duffel's side, like a 5xx.
  if (status >= 500 || status === 429) {
    return errorResponse('provider_error', MESSAGES.providerError, 502)
  }
  return errorResponse('internal', MESSAGES.internal, 500)
}
