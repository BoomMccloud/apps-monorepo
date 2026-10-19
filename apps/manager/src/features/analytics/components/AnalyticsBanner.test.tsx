import '@testing-library/jest-dom'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analyticsConsentContext'
import { BOTTOM_BAR_CLEARANCE_PROPERTY } from '@ens-apps/utils/bottomBarClearance'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsBanner } from './AnalyticsBanner'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    hash,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly to: string
    readonly hash?: string
  }) => (
    <a href={hash ? `${to}#${hash}` : to} {...props}>
      {children}
    </a>
  ),
}))

const renderBanner = (consent: AnalyticsConsentState) => {
  const accept = vi.fn()
  const decline = vi.fn()
  render(
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      <AnalyticsBanner />
    </AnalyticsConsentContext>,
  )
  return { accept, decline }
}

const banner = () =>
  screen.queryByRole('region', { name: 'Help us improve ENS' })

describe('AnalyticsBanner', () => {
  it('asks a visitor who has not chosen, with equal buttons and a link to the notice', () => {
    renderBanner('pending')

    expect(banner()).toBeInTheDocument()
    expect(banner()).toHaveTextContent(
      /Optional analytics help ENS understand how the apps are used, find problems and improve the experience/,
    )
    expect(banner()).toHaveTextContent(
      /PostHog processes for ENS: your wallet address/,
    )
    const accept = screen.getByRole('button', { name: 'Accept Analytics' })
    const decline = screen.getByRole('button', { name: 'Decline' })
    expect(accept.className).toBe(decline.className)
    expect(
      screen.getByRole('link', { name: 'Privacy notice' }),
    ).toHaveAttribute('href', '/legal/privacy-policy#analytics')
  })

  it('sits above a bar fixed to the bottom of the page, by the space the bars publish', () => {
    renderBanner('pending')

    // greptile: no-arbitrary-tailwind: this is the class the component
    // justifies, written out so that the test can look for it.
    expect(banner()?.className).toContain(
      `bottom-[calc(1.5rem+var(${BOTTOM_BAR_CLEARANCE_PROPERTY},0px))]`,
    )
  })

  it.each([
    'granted',
    'denied',
    'unknown',
  ] as const)('is not shown once the choice is %s', (consent) => {
    renderBanner(consent)
    expect(banner()).not.toBeInTheDocument()
  })

  it('passes each press on', () => {
    const { accept, decline } = renderBanner('pending')

    fireEvent.click(screen.getByRole('button', { name: 'Accept Analytics' }))
    expect(accept).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(decline).toHaveBeenCalledOnce()
  })
})
