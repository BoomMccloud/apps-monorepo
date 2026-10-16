import type { AnalyticsConsentState } from '@ens-apps/utils/analytics-consent-context'
import { useEffect } from 'react'
import { startPostHog } from './start'
import { bootSupportChat } from './supportChat'

/**
 * On mount: start PostHog, report the choice the page starts with, and boot
 * the support chat.
 */
export const usePostHogStart = (
  onStarted: (consent: AnalyticsConsentState) => void,
): void => {
  useEffect(() => {
    const consent = startPostHog()
    onStarted(consent)
    bootSupportChat(consent)
  }, [onStarted])
}
