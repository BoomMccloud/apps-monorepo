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
  it('links the ENS privacy policy, which opens in a new tab', () => {
    render(<HelpMenu />)

    const policy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(policy).toHaveAttribute(
      'href',
      'https://ens.domains/legal/privacy-policy',
    )
    expect(policy).toHaveAttribute('target', '_blank')
    expect(policy).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it("opens the Explorer's Privacy settings page in the same tab", () => {
    render(<HelpMenu />)

    const settings = screen.getByRole('link', { name: 'Privacy settings' })
    expect(settings).toHaveAttribute('href', '/privacy')
    expect(settings).not.toHaveAttribute('target')
    expect(settings).not.toHaveAttribute('rel')
  })
})
