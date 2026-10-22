import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'
import {
  type DomTestKit,
  expectPrivacyPolicyLink,
  renderWithChoice,
} from './domTestKit'

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
  const renderPage = () => renderWithChoice(render, Page, 'pending')

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

      expectPrivacyPolicyLink(
        screen.getByRole('link', { name: 'Read the full privacy policy' }),
      )
    })
  })
}
