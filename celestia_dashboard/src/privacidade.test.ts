import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIVACY_URL } from './components/Footer'

const PROJECT_ROOT = new URL('../', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, PROJECT_ROOT), 'utf8')

describe('privacidade.html', () => {
  const html = read('privacidade.html')

  it('is served at the URL the footer links to by both Vercel projects (dashboard root and repo root)', () => {
    for (const file of ['vercel.json', '../vercel.json']) {
      const vercel = JSON.parse(read(file)) as { rewrites?: { source: string; destination: string }[] }
      expect(vercel.rewrites, file).toContainEqual({ source: PRIVACY_URL, destination: '/privacidade.html' })
    }
  })

  it('is a pt-BR page with a last-updated date and a clearly marked contact placeholder', () => {
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toMatch(/Última atualização: <time datetime="\d{4}-\d{2}-\d{2}">/)
    expect(html).toMatch(/\[PREENCHER: e-mail de contato\]/)
  })

  it('names every place the app sends or keeps data', () => {
    for (const term of [
      'Supabase',
      'Google',
      'Apple',
      'Duffel',
      'seats.aero',
      'Vercel',
      'Google Fonts',
      'localStorage',
      'sessionStorage',
      'celestia:miles',
      'celestia:pendingSave',
    ]) {
      expect(html, term).toContain(term)
    }
  })

  it('has no scripts, so it needs nothing from the CSP beyond self and the fonts', () => {
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('<link rel="stylesheet" href="/src/index.css" />')
  })
})
