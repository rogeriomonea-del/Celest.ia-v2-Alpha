// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Footer } from './Footer'

afterEach(cleanup)

describe('Footer', () => {
  it('shows the copyright line and no placeholder links', () => {
    render(<Footer />)
    expect(screen.getByText(/© \d{4} celest\.ia/)).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.querySelector('a[href="#"]')).toBeNull()
  })
})
