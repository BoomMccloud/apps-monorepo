import { type ComponentType, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '../analyticsConsentContext'
import type { DomTestKit } from './domTestKit'

/**
 * What the analytics banner does in every ENS app: it asks a visitor who has
 * not chosen, with equal buttons and a link to the privacy policy, and it is
 * shown no longer once they have. Where it sits and how it looks is the app's
 * own, and its browser walk's.
 */
export const describeAnalyticsBanner = ({
  Banner,
  kit: { render, screen, press },
}: {
  readonly Banner: ComponentType
  readonly kit: DomTestKit
}): void => {
  const renderBanner = (consent: AnalyticsConsentState) => {
    const accept = vi.fn()
    const decline = vi.fn()
    render(
      createElement(
        AnalyticsConsentContext,
        { value: { consent, accept, decline } },
        createElement(Banner),
      ),
    )
    return { accept, decline }
  }

  const banner = () =>
    screen.queryByRole('region', { name: 'Help us improve ENS' })

  describe('AnalyticsBanner', () => {
    it('asks a visitor who has not chosen, with equal buttons and a link to the privacy policy', () => {
      renderBanner('pending')

      expect(banner()).not.toBeNull()
      expect(banner()?.textContent).toMatch(
        /Optional analytics help ENS understand how the apps are used, find problems and improve the experience/,
      )
      const accept = screen.getByRole('button', { name: 'Accept Analytics' })
      const decline = screen.getByRole('button', { name: 'Decline' })
      expect(accept.className).toBe(decline.className)
    })

    it('links the ENS privacy policy, which opens in a new tab', () => {
      renderBanner('pending')

      const policy = screen.getByRole('link', { name: 'Privacy policy' })
      expect(policy.getAttribute('href')).toBe(
        'https://ens.domains/legal/privacy-policy',
      )
      expect(policy.getAttribute('target')).toBe('_blank')
      expect(policy.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('says where the choice can be changed', () => {
      renderBanner('pending')

      expect(banner()?.textContent).toContain(
        'you can change it in Privacy settings at any time',
      )
    })

    // What is collected is the notice's to list, on the Privacy settings page.
    it('lists no data: it holds the intro and where the choice is changed, and no more', () => {
      renderBanner('pending')

      const paragraphs = Array.from(
        banner()?.querySelectorAll('p') ?? [],
        (paragraph) => paragraph.textContent,
      )
      expect(paragraphs).toEqual([
        'Optional analytics help ENS understand how the apps are used, find problems and improve the experience.',
        'Your choice applies to all ENS apps that share it, and you can change it in Privacy settings at any time.',
      ])
      expect(banner()?.textContent).not.toMatch(
        /PostHog|wallet address|IP address|error reports/i,
      )
    })

    it.each([
      'granted',
      'denied',
      'unknown',
    ] as const)('is not shown once the choice is %s', (consent) => {
      renderBanner(consent)
      expect(banner()).toBeNull()
    })

    it('passes each press on', async () => {
      const { accept, decline } = renderBanner('pending')

      await press(screen.getByRole('button', { name: 'Accept Analytics' }))
      expect(accept).toHaveBeenCalledOnce()
      await press(screen.getByRole('button', { name: 'Decline' }))
      expect(decline).toHaveBeenCalledOnce()
    })
  })
}
