// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createFakeSupabase, type FakeSupabase } from '../test/fakeSupabase'
import { AuthProvider, useAuth } from './AuthProvider'

const mocks = vi.hoisted(() => ({ client: null as unknown, configured: true }))

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return mocks.client
  },
  get isAuthConfigured() {
    return mocks.configured
  },
}))

let fake: FakeSupabase

function Opener() {
  const { openLogin } = useAuth()
  return (
    <button type="button" onClick={openLogin}>
      Abrir login
    </button>
  )
}

async function renderAndOpen() {
  render(
    <AuthProvider>
      <Opener />
    </AuthProvider>,
  )
  const opener = screen.getByRole('button', { name: 'Abrir login' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = await screen.findByRole('dialog', { name: 'Entre na sua conta' })
  return { opener, dialog }
}

beforeEach(() => {
  fake = createFakeSupabase(null)
  mocks.client = fake
  mocks.configured = true
  window.history.replaceState(null, '', '/voos?origem=GRU#topo')
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('LoginDialog', () => {
  it('is an accessible modal that receives focus', async () => {
    const { dialog } = await renderAndOpen()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const google = screen.getByRole('button', { name: 'Continuar com Google' })
    expect(screen.getByRole('button', { name: 'Continuar com Apple' })).toBeEnabled()
    expect(google).toHaveFocus()
  })

  it.each([
    ['Continuar com Google', 'google'],
    ['Continuar com Apple', 'apple'],
  ])('"%s" starts OAuth with provider %s and redirects back to this page', async (label, provider) => {
    await renderAndOpen()
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(fake.auth.signInWithOAuth).toHaveBeenCalledTimes(1))
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider,
      options: { redirectTo: 'http://localhost:3000/voos' },
    })
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-busy', 'true')
  })

  it('shows an error and clears the loading state when OAuth cannot start', async () => {
    fake.auth.signInWithOAuth.mockResolvedValueOnce({ data: null, error: new Error('boom') })
    await renderAndOpen()
    const google = screen.getByRole('button', { name: 'Continuar com Google' })
    fireEvent.click(google)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível iniciar o login')
    expect(google).not.toHaveAttribute('aria-busy')
  })

  it('closes on Escape and returns focus to the opener', async () => {
    const { opener } = await renderAndOpen()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('closes on backdrop click but not on clicks inside the dialog', async () => {
    const { dialog } = await renderAndOpen()
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('login-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps Tab focus inside the dialog', async () => {
    const { dialog } = await renderAndOpen()
    const close = screen.getByRole('button', { name: 'Fechar' })
    const apple = screen.getByRole('button', { name: 'Continuar com Apple' })
    apple.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(apple).toHaveFocus()
  })

  it('shows "Login indisponível" and disables the buttons when not configured', async () => {
    mocks.client = null
    mocks.configured = false
    await renderAndOpen()
    expect(screen.getByText('Login indisponível no momento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continuar com Apple' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
  })
})

describe('AuthProvider OAuth redirect handling', () => {
  it('maps a known error to a fixed message, never the URL description, and strips the error params', async () => {
    window.history.replaceState(
      null,
      '',
      '/?error=access_denied&error_code=bad_oauth&error_description=Acesso+negado+pelo+usu%C3%A1rio&q=1',
    )
    render(
      <AuthProvider>
        <span />
      </AuthProvider>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('O acesso foi negado ou o login foi cancelado. Tente novamente.')
    expect(alert).not.toHaveTextContent('Acesso negado pelo usuário')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(window.location.search).toBe('?q=1')
  })

  it('prefers a known error_code over the generic error value', async () => {
    window.history.replaceState(null, '', '/#error=invalid_request&error_code=bad_oauth_state')
    render(
      <AuthProvider>
        <span />
      </AuthProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('O login expirou ou foi interrompido. Tente novamente.')
    expect(window.location.hash).toBe('')
  })

  it('shows the generic message for an unknown error and never echoes error_description', async () => {
    window.history.replaceState(
      null,
      '',
      '/?error=whatever&error_description=Sua+conta+foi+bloqueada.+Ligue+0800-000-0000',
    )
    render(
      <AuthProvider>
        <span />
      </AuthProvider>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível concluir o login. Tente novamente.')
    expect(screen.queryByText(/0800/)).not.toBeInTheDocument()
    expect(screen.queryByText(/whatever/)).not.toBeInTheDocument()
  })

  it('strips a leftover ?code= and reports a failed callback when no session results', async () => {
    window.history.replaceState(null, '', '/?code=abc123')
    render(
      <AuthProvider>
        <span />
      </AuthProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir o login')
    expect(window.location.search).toBe('')
  })

  it('unsubscribes from auth changes on unmount', async () => {
    const { unmount } = render(
      <AuthProvider>
        <span />
      </AuthProvider>,
    )
    await waitFor(() => expect(fake.auth.getSession).toHaveBeenCalled())
    unmount()
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
