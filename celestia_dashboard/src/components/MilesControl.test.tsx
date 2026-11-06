// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MilesControl } from './MilesControl'
import { DEFAULT_MILES_PREFS, type MilesPrefs } from '../features/miles/useMilesPrefs'

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

function renderControl(prefs: MilesPrefs = DEFAULT_MILES_PREFS) {
  const onApply = vi.fn()
  render(
    <div>
      <MilesControl prefs={prefs} onApply={onApply} />
      <button type="button">fora</button>
    </div>,
  )
  return onApply
}

const trigger = () => screen.getByRole('button', { name: /^Milhas/ })
const milheiroInput = () => screen.getByLabelText('Milheiro (R$ por mil milhas)') as HTMLInputElement
const balanceInput = () => screen.getByLabelText('Saldo de milhas') as HTMLInputElement

afterEach(cleanup)

describe('MilesControl', () => {
  it('is a closed popover trigger with a short label when disabled', () => {
    renderControl()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(plain(trigger().textContent)).toBe('Milhas')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('summarises program and effective milheiro on the trigger when enabled', () => {
    renderControl({ ...DEFAULT_MILES_PREFS, enabled: true })
    expect(plain(trigger().textContent)).toBe('Milhas: LATAM Pass · R$ 29')
    cleanup()

    renderControl({ enabled: true, program: 'smiles', milheiroBrl: 17.5, balance: 0 })
    expect(plain(trigger().textContent)).toBe('Milhas: Smiles (GOL) · R$ 17,50')
    cleanup()

    renderControl({ enabled: true, program: 'lifemiles', milheiroBrl: null, balance: 0 })
    expect(plain(trigger().textContent)).toBe('Milhas: LifeMiles (Avianca)')
  })

  it('opens a dialog with the switch focused and the fields prefilled', () => {
    renderControl()
    fireEvent.click(trigger())

    expect(screen.getByRole('dialog', { name: 'Preferências de milhas' })).toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    const toggle = screen.getByRole('switch', { name: 'Comparar com milhas' })
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('combobox', { name: 'Programa' })).toHaveValue('latampass')
    expect(screen.getByRole('option', { name: 'Smiles (GOL)' })).toBeInTheDocument()
    expect(milheiroInput().value).toBe('29')
    expect(balanceInput().value).toBe('')
    expect(screen.getByText('Milheiro = quanto você paga por 1.000 milhas (compra/transferência).')).toBeInTheDocument()
  })

  it('switches the untouched milheiro to the new program default, or to the "informe" placeholder', () => {
    renderControl()
    fireEvent.click(trigger())
    const program = screen.getByRole('combobox', { name: 'Programa' })

    fireEvent.change(program, { target: { value: 'smiles' } })
    expect(milheiroInput().value).toBe('22')

    fireEvent.change(program, { target: { value: 'lifemiles' } })
    expect(milheiroInput().value).toBe('')
    expect(milheiroInput()).toHaveAttribute('placeholder', 'informe')
  })

  it('keeps a milheiro the user typed when the program changes', () => {
    renderControl()
    fireEvent.click(trigger())
    fireEvent.change(milheiroInput(), { target: { value: '18' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Programa' }), { target: { value: 'azul' } })
    expect(milheiroInput().value).toBe('18')
  })

  it('"Aplicar" hands the new prefs to onApply and closes', () => {
    const onApply = renderControl()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('switch', { name: 'Comparar com milhas' }))
    expect(screen.getByRole('switch', { name: 'Comparar com milhas' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(screen.getByRole('combobox', { name: 'Programa' }), { target: { value: 'smiles' } })
    fireEvent.change(milheiroInput(), { target: { value: '18.5' } })
    fireEvent.change(balanceInput(), { target: { value: '45000' } })

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(onApply).toHaveBeenCalledWith({ enabled: true, program: 'smiles', milheiroBrl: 18.5, balance: 45000 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('stores a milheiro equal to the program default as null (follow the default)', () => {
    const onApply = renderControl()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('switch', { name: 'Comparar com milhas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onApply).toHaveBeenCalledWith({ enabled: true, program: 'latampass', milheiroBrl: null, balance: 0 })
  })

  it('refuses an invalid milheiro or balance with an alert', () => {
    const onApply = renderControl()
    fireEvent.click(trigger())
    fireEvent.change(milheiroInput(), { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Milheiro inválido')

    fireEvent.change(milheiroInput(), { target: { value: '25' } })
    // Dots are pt-BR thousands separators now; a decimal comma is still not a balance.
    fireEvent.change(balanceInput(), { target: { value: '10,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Saldo de milhas inválido')
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('accepts a pt-BR formatted balance and shows the parsed value beside the field', () => {
    const onApply = renderControl()
    fireEvent.click(trigger())
    expect(balanceInput()).toHaveAttribute('type', 'text')
    expect(balanceInput()).toHaveAttribute('inputmode', 'numeric')

    fireEvent.change(balanceInput(), { target: { value: '60.000' } })
    expect(balanceInput()).toHaveAccessibleDescription('60.000 milhas')

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onApply).toHaveBeenCalledWith({ enabled: false, program: 'latampass', milheiroBrl: null, balance: 60000 })
  })

  it('rejects a balance with letters', () => {
    const onApply = renderControl()
    fireEvent.click(trigger())
    fireEvent.change(balanceInput(), { target: { value: 'abc' } })
    expect(balanceInput()).toHaveAccessibleDescription('')

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Saldo de milhas inválido')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('anchors the popover to the right from sm up, where the trigger sits at the end of the row', () => {
    renderControl()
    fireEvent.click(trigger())
    expect(screen.getByRole('dialog')).toHaveClass('sm:right-0', 'sm:left-auto')
  })

  it('Escape closes without applying and returns focus to the trigger', () => {
    const onApply = renderControl()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('switch', { name: 'Comparar com milhas' }))
    fireEvent.keyDown(screen.getByRole('switch', { name: 'Comparar com milhas' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('an outside click closes it, and reopening discards the unapplied draft', () => {
    renderControl()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('switch', { name: 'Comparar com milhas' }))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'fora' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(trigger())
    expect(screen.getByRole('switch', { name: 'Comparar com milhas' })).toHaveAttribute('aria-checked', 'false')
  })
})
