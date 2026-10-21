import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PrivacyNoticePage } from './PrivacyNoticePage'

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

describe('PrivacyNoticePage', () => {
  it('holds the analytics notice and keeps the full policy one click away', () => {
    render(<PrivacyNoticePage />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy notice' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Analytics' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Read the full privacy policy' }),
    ).toHaveAttribute('href', 'https://ens.domains/legal/privacy-policy')
  })
})
