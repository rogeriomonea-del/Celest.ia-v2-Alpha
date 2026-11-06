// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Footer, PRIVACY_URL } from './Footer'

afterEach(cleanup)

describe('Footer', () => {
  it('shows the copyright line', () => {
    render(<Footer />)
    expect(screen.getByText(/© \d{4} celest\.ia/)).toBeInTheDocument()
  })

  it('links to the privacy policy and to nothing else', () => {
    render(<Footer />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent('Política de Privacidade')
    expect(links[0]).toHaveAttribute('href', '/privacidade')
    expect(PRIVACY_URL).toBe('/privacidade')
    expect(document.querySelector('a[href="#"]')).toBeNull()
  })
})
