import type { AnalyticsConsentState } from '@ens-apps/utils/analytics-consent-context'
import { useEffect } from 'react'
import { subscribeFailedRunReports } from './failedRunReports'
import type { FeatureSwitches } from './feature-flags'
import { startPostHog } from './start'
import { bootSupportChat } from './supportChat'

/**
 * Once the page has hydrated: start PostHog with the switches the server
 * decided, report the choice the page starts with, boot the support chat,
 * and report failed transaction runs until unmount.
 */
export const usePostHogStart = (
  isHydrated: boolean,
  switches: FeatureSwitches,
  onStarted: (consent: AnalyticsConsentState) => void,
): void => {
  useEffect(() => {
    if (!isHydrated) return
    const consent = startPostHog(switches)
    onStarted(consent)
    bootSupportChat(consent)
    return subscribeFailedRunReports()
  }, [isHydrated, switches, onStarted])
}
