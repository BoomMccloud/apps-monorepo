import { type ComponentType, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsConsentContext } from '../analyticsConsentContext'
import type { DomTestKit } from './domTestKit'

/**
 * What the Privacy settings page is in every ENS app: its own heading, the
 * analytics notice, and the full privacy policy one click away, in a new tab.
 * What the notice says and does is `describeAnalyticsNotice`'s.
 */
export const describePrivacySettingsPage = ({
  Page,
  kit: { render, screen },
}: {
  readonly Page: ComponentType
  readonly kit: DomTestKit
}): void => {
  const renderPage = () =>
    render(
      createElement(
        AnalyticsConsentContext,
        { value: { consent: 'pending', accept: vi.fn(), decline: vi.fn() } },
        createElement(Page),
      ),
    )

  describe('PrivacySettingsPage', () => {
    it('is the Privacy settings page and holds the analytics notice', () => {
      renderPage()

      expect(
        screen.queryByRole('heading', { level: 1, name: 'Privacy settings' }),
      ).not.toBeNull()
      expect(screen.queryByRole('region', { name: 'Analytics' })).not.toBeNull()
    })

    it('keeps the full policy one click away, in a new tab', () => {
      renderPage()

      const policy = screen.getByRole('link', {
        name: 'Read the full privacy policy',
      })
      expect(policy.getAttribute('href')).toBe(
        'https://ens.domains/legal/privacy-policy',
      )
      expect(policy.getAttribute('target')).toBe('_blank')
      expect(policy.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })
}
