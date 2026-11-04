import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ApiErrorBody } from '../src/shared/api.js'
import { MESSAGES, validationErrorResponse } from './http.js'

async function messageFor(schema: z.ZodTypeAny, value: unknown): Promise<string> {
  const parsed = schema.safeParse(value)
  if (parsed.success) throw new Error('expected a validation failure')
  const res = validationErrorResponse(parsed.error)
  expect(res.status).toBe(400)
  return ((await res.json()) as ApiErrorBody).error.message
}

describe('validationErrorResponse', () => {
  it("falls back to a generic pt-BR message when zod's English default would leak", async () => {
    const schema = z.object({ name: z.string(), size: z.number().max(3), kind: z.enum(['a', 'b']) })
    expect(await messageFor(schema, {})).toBe(MESSAGES.invalidSearch)
    expect(await messageFor(schema, { name: 1, size: 1, kind: 'a' })).toBe(MESSAGES.invalidSearch)
    expect(await messageFor(schema, { name: 'x', size: 9, kind: 'a' })).toBe(MESSAGES.invalidSearch)
    expect(await messageFor(schema, { name: 'x', size: 1, kind: 'c' })).toBe(MESSAGES.invalidSearch)
    expect(MESSAGES.invalidSearch).toBe('Dados da busca inválidos.')
  })

  it('keeps messages the schema provides', async () => {
    const schema = z
      .object({ code: z.string().regex(/^[A-Z]{3}$/, 'Código IATA inválido') })
      .refine((v) => v.code !== 'XXX', { message: 'Código reservado' })
    expect(await messageFor(schema, { code: 'ab' })).toBe('Código IATA inválido')
    expect(await messageFor(schema, { code: 'XXX' })).toBe('Código reservado')
  })
})
