import '@testing-library/jest-dom'
import { fireEvent, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { NavigationContent } from './NavigationContent'

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

describe('NavigationContent', () => {
  it('links the ENS privacy policy, which opens in a new tab', () => {
    render(<NavigationContent onAction={vi.fn()} />)

    const policy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(policy).toHaveAttribute(
      'href',
      'https://ens.domains/legal/privacy-policy',
    )
    expect(policy).toHaveAttribute('target', '_blank')
  })

  it("links the Manager's Privacy settings page, in the same tab", () => {
    const onAction = vi.fn()
    render(<NavigationContent onAction={onAction} />)

    const settings = screen.getByRole('link', { name: 'Privacy settings' })
    expect(settings).toHaveAttribute('href', '/privacy')
    expect(settings).not.toHaveAttribute('target')
    expect(settings).not.toHaveAttribute('rel')

    fireEvent.click(settings)
    expect(onAction).toHaveBeenCalledOnce()
  })
})
