import type { render, screen } from '@testing-library/react'
import { type ComponentType, createElement } from 'react'
import { expect, vi } from 'vitest'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '../analyticsConsentContext'

/**
 * What an app hands the shared view suites to drive its own components with.
 * The app passes its own Testing Library, so that the suites hold no copy of
 * React or of Testing Library, and says how it presses an element (its tests
 * use `fireEvent` or `user-event`).
 */
export type DomTestKit = {
  readonly render: typeof render
  readonly screen: typeof screen
  readonly press: (element: HTMLElement) => unknown
}

/** Render a view inside the visitor's choice, with spies for the two steps that change it. */
export const renderWithChoice = (
  renderView: DomTestKit['render'],
  View: ComponentType,
  consent: AnalyticsConsentState,
) => {
  const accept = vi.fn()
  const decline = vi.fn()
  renderView(
    createElement(
      AnalyticsConsentContext,
      { value: { consent, accept, decline } },
      createElement(View),
    ),
  )
  return { accept, decline }
}

/** A link to the ENS privacy policy, which lives on ens.domains and opens in a new tab. */
export const expectPrivacyPolicyLink = (link: HTMLElement): void => {
  expect(link.getAttribute('href')).toBe(
    'https://ens.domains/legal/privacy-policy',
  )
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
}
