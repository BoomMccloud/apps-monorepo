import { createContext, useContext } from 'react'
import type { AnalyticsConsent } from './analytics-consent'

/** The choice as the page knows it; `unknown` until the SDK has started. */
export type AnalyticsConsentState = AnalyticsConsent | 'unknown'

export type AnalyticsConsentValue = {
  readonly consent: AnalyticsConsentState
  readonly accept: () => void
  readonly decline: () => void
}

/**
 * The visitor's choice for the banner and the notice. Each app's PostHog
 * provider supplies it, since PostHog emits nothing when the choice changes.
 */
export const AnalyticsConsentContext = createContext<AnalyticsConsentValue>({
  consent: 'unknown',
  accept: () => {},
  decline: () => {},
})

export const useAnalyticsConsent = (): AnalyticsConsentValue =>
  useContext(AnalyticsConsentContext)
