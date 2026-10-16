import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HelpMenu } from './HelpMenu'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('HelpMenu', () => {
  it("opens the Explorer's own privacy notice, with the analytics choice", () => {
    render(<HelpMenu />)

    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }),
    ).toHaveAttribute('href', '/privacy')
  })
})
